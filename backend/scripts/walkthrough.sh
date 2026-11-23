#!/usr/bin/env bash
# End-to-end walkthrough of the main flow with curl, against a running, seeded API.
#
#   ./scripts/walkthrough.sh               (API on localhost:4000, Mailpit on localhost:8025)
#
# upload template -> publish -> precheck -> generate 24 -> download ZIP/merged PDF -> send ->
# recipient opens the link from the email (view only) -> coordinator uploads the scan of the signed paper -> remind another -> signature table -> export ->
# (S-6) publish v2 -> "signed older version" -> resend with change summary
#
# Requires: curl, jq. Safe to re-run: it creates a new template each time.
set -euo pipefail

API=${API:-http://localhost:4000/api}
MAILPIT=${MAILPIT:-http://localhost:8025}
DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT=${OUT:-$(mktemp -d)}
GROUP=grp-web-2026-a

step() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }
login() { curl -sf "$API/auth/login" -H 'content-type: application/json' -d "{\"email\":\"$1\",\"password\":\"$2\"}" | jq -r .token; }
# Fail loudly with the API's JSON error instead of curl's generic message.
call() { local res; res=$(curl -s -w '\n%{http_code}' "$@"); local code=${res##*$'\n'}; local body=${res%$'\n'*};
  if [[ $code -ge 400 ]]; then echo "HTTP $code: $body" >&2; exit 1; fi; echo "$body"; }

step "Login (editor, coordinator)"
EDITOR=$(login editor@academy.am 'Editor123!')
COORD=$(login coordinator@academy.am 'Coord123!')
echo "editor + coordinator tokens OK"

step "Editor uploads a template (.docx) -> v1 draft"
CREATE=$(call "$API/templates" -H "authorization: Bearer $EDITOR" \
  -F "title=Ուսուցման պայմանագիր (walkthrough $(date +%H:%M:%S))" -F category=student_agreement \
  -F "file=@$DIR/seed/templates/student_agreement_v1.docx")
TPL=$(jq -r .template.id <<<"$CREATE"); V1=$(jq -r .version.id <<<"$CREATE")
echo "template=$TPL v1=$V1 warnings=$(jq -c '.warnings' <<<"$CREATE")"

step "Editor publishes v1"
call -X POST "$API/templates/$TPL/versions/$V1/publish" -H "authorization: Bearer $EDITOR" | jq -c '{versionNumber, status, publishedAt}'

step "Coordinator: precheck for group $GROUP (no values yet)"
call "$API/batches/precheck" -H "authorization: Bearer $COORD" -H 'content-type: application/json' \
  -d "{\"templateId\":\"$TPL\",\"recipientType\":\"student\",\"groupId\":\"$GROUP\"}" \
  | jq -c '{total, ready, missingCommon: [.missingCommon[].key], recipientsWithGaps: [.recipients[] | select(.missing|length>0) | {id, name, missing: [.missing[].key]}]}'

BODY=$(jq -nc --arg t "$TPL" --arg g "$GROUP" '{
  templateId: $t, recipientType: "student", groupId: $g,
  commonValues: { "contract.date": "2026-11-21", "contract.amount": 450000 },
  overrides: { "stu-007": { "student.passport": "AN7654321" }, "stu-015": { "student.address": "ք. Երևան, Աբովյան փ. 52, բն. 4" } } }')

step "Precheck again with shared values + manual fills for the 2 incomplete students"
call "$API/batches/precheck" -H "authorization: Bearer $COORD" -H 'content-type: application/json' -d "$BODY" | jq -c '{total, ready}'

step "Generate the pack (24 documents) and poll progress"
START=$(date +%s)
BATCH=$(call "$API/batches" -H "authorization: Bearer $COORD" -H 'content-type: application/json' -d "$BODY" | jq -r .id)
while :; do
  B=$(call "$API/batches/$BATCH" -H "authorization: Bearer $COORD")
  printf '\r  %s  %s / %s  ' "$(jq -r .status <<<"$B")" "$(jq -r .progress <<<"$B")" "$(jq -r .total <<<"$B")"
  case $(jq -r .status <<<"$B") in completed) break ;; failed) echo; jq . <<<"$B"; exit 1 ;; esac
  sleep 1
done
echo; echo "generated in $(( $(date +%s) - START )) s"

step "Download ZIP + merged PDF"
curl -sf -o "$OUT/pack.zip" "$API/batches/$BATCH/zip" -H "authorization: Bearer $COORD"
curl -sf -o "$OUT/pack.pdf" "$API/batches/$BATCH/merged-pdf" -H "authorization: Bearer $COORD"
echo "ZIP entries: $(unzip -l "$OUT/pack.zip" | tail -1 | awk '{print $2}')  (24 PDF + 24 DOCX)"
echo "merged PDF: $(wc -c <"$OUT/pack.pdf" | tr -d ' ') bytes -> $OUT/pack.pdf"

DOCS=$(call "$API/documents?batchId=$BATCH" -H "authorization: Bearer $COORD")
echo "documents: $(jq length <<<"$(jq .items <<<"$DOCS")"), numbers $(jq -r '[.items[].number]|sort|first' <<<"$DOCS") … $(jq -r '[.items[].number]|sort|last' <<<"$DOCS")"
curl -sf -o "$OUT/first.pdf" "$API/documents/$(jq -r '.items[0].id' <<<"$DOCS")/pdf" -H "authorization: Bearer $COORD"

step "Send all 24 for signature"
call "$API/documents/send" -H "authorization: Bearer $COORD" -H 'content-type: application/json' \
  -d "$(jq -c '{documentIds: [.items[].id]}' <<<"$DOCS")" | jq -c '{sent}'

SIGNER=$(jq -r '[.items[] | select(.recipientId=="stu-001")][0]' <<<"$DOCS")
SIGNER_EMAIL=$(jq -r .recipientEmail <<<"$SIGNER"); SIGNER_DOC=$(jq -r .id <<<"$SIGNER")
step "Signer ($SIGNER_EMAIL) opens the link from the Mailpit email"
sleep 1
MSG=$(curl -sf "$MAILPIT/api/v1/search?query=to:$SIGNER_EMAIL" | jq -r '.messages[0].ID')
TOKEN=$(curl -sf "$MAILPIT/api/v1/message/$MSG" | jq -r .Text | grep -oE '/sign/[A-Za-z0-9_-]+' | head -1 | cut -d/ -f3)
echo "token from email: ${TOKEN:0:8}… (${#TOKEN} chars)"
curl -sf "$API/sign/$TOKEN" | jq -c '{documentNumber, title, versionNumber, status}'

step "Signer downloads the document to print and sign by hand (there is no online signing)"
curl -sf -o "$OUT/document.pdf" "$API/sign/$TOKEN/pdf"
echo "document -> $OUT/document.pdf"
echo -n "online signing attempt: "; curl -s -X POST "$API/sign/$TOKEN" -H 'content-type: application/json' -d '{"agree":true}' | jq -c .error

step "Coordinator uploads the scan of the signed paper (the scan is required)"
echo -n "without a scan: "; curl -s -X POST "$API/documents/$SIGNER_DOC/paper-signature" -H "authorization: Bearer $COORD" | jq -c .error
call "$API/documents/$SIGNER_DOC/paper-signature" -H "authorization: Bearer $COORD" -F "file=@$OUT/document.pdf;filename=scan.pdf" | jq -c '{method, signedAt, hasScan}'
curl -sf "$API/sign/$TOKEN" | jq -c '{status, signatureMethod, signedAt}'

OTHER_DOC=$(jq -r '[.items[] | select(.recipientId=="stu-002")][0].id' <<<"$DOCS")
step "Coordinator: remind now (stu-002), and try to remind the signed document"
call -X POST "$API/documents/$OTHER_DOC/remind" -H "authorization: Bearer $COORD" | jq -c '{type, sentAt}'
echo -n "remind signed doc: "; curl -s -X POST "$API/documents/$SIGNER_DOC/remind" -H "authorization: Bearer $COORD" | jq -c .error

step "Signature table for the group (this template)"
call "$API/signatures/table?groupId=$GROUP&templateId=$TPL" -H "authorization: Bearer $COORD" \
  | jq -r '.items | (group_by(.status) | map("\(.[0].status): \(length)") | join(", ")), (.[] | select(.status=="signed" or .reminderCount>0) | "  \(.recipientName) · \(.number) · v\(.versionNumber) · \(.status) · \(.signedAt // "-") · reminders \(.reminderCount)")'

step "Export CSV + XLSX"
curl -sf -o "$OUT/signatures.csv" "$API/signatures/export?format=csv&templateId=$TPL" -H "authorization: Bearer $COORD"
curl -sf -o "$OUT/signatures.xlsx" "$API/signatures/export?format=xlsx&templateId=$TPL" -H "authorization: Bearer $COORD"
head -2 "$OUT/signatures.csv"

step "S-6: editor uploads v2 -> auto comparison + summary -> publish"
V2R=$(call "$API/templates/$TPL/versions" -H "authorization: Bearer $EDITOR" -F "file=@$DIR/seed/templates/student_agreement_v2.docx")
V2=$(jq -r .version.id <<<"$V2R")
jq -r '"counts: \(.comparison.counts|tostring)\nsummary:\n\(.version.changeSummary)"' <<<"$V2R"
call -X POST "$API/templates/$TPL/versions/$V2/publish" -H "authorization: Bearer $EDITOR" | jq -c '{versionNumber, status}'

step "Coordinator: filter 'signed an older version' -> resend new version"
call "$API/signatures/table?templateId=$TPL&olderVersion=true" -H "authorization: Bearer $COORD" | jq -c '[.items[] | {recipientName, number, versionNumber}]'
RES=$(call "$API/documents/resend-new-version" -H "authorization: Bearer $COORD" -H 'content-type: application/json' -d "{\"templateId\":\"$TPL\"}")
jq -c '{recipients, batches: [.batches[].id]}' <<<"$RES"
NB=$(jq -r '.batches[0].id' <<<"$RES")
until [[ $(call "$API/batches/$NB" -H "authorization: Bearer $COORD" | jq -r .status) == completed ]]; do sleep 1; done
sleep 1
echo "email to $SIGNER_EMAIL:"
curl -sf "$MAILPIT/api/v1/search?query=to:$SIGNER_EMAIL" | jq -r '.messages[0].Subject'

echo; echo "Files in $OUT"; ls -1 "$OUT"
