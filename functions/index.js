const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const nodemailer = require("nodemailer");

const gmailAppPassword = defineSecret("GMAIL_APP_PASSWORD");

const COACH_EMAIL = "jaimeespinalpr@gmail.com";
const SENDER_EMAIL = "jaimeespinalpr@gmail.com";
const IGNORED_FIELDS = new Set(["updatedAt", "createdAt"]);

function diffFields(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const changed = [];
  keys.forEach((key) => {
    if (IGNORED_FIELDS.has(key)) return;
    if (JSON.stringify(before ? before[key] : undefined) !== JSON.stringify(after[key])) {
      changed.push(key);
    }
  });
  return changed;
}

function formatValue(value) {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "(vacío)";
  if (value === undefined || value === null || value === "") return "(vacío)";
  return String(value);
}

exports.notifyCoachOnProfileChange = onDocumentWritten(
  { document: "users/{userId}", secrets: [gmailAppPassword], region: "us-central1" },
  async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    if (!after) return;

    const isNew = !before;
    const changedFields = isNew ? Object.keys(after).filter((k) => !IGNORED_FIELDS.has(k)) : diffFields(before, after);
    if (!isNew && changedFields.length === 0) return;

    const name = after.name || after.email || "Sin nombre";
    const subject = isNew ? `Nuevo perfil creado: ${name}` : `Perfil actualizado: ${name}`;
    const bodyLines = [
      isNew
        ? `Se creó un nuevo perfil: ${name} (${after.email || "sin correo"}).`
        : `El perfil de ${name} (${after.email || "sin correo"}) fue actualizado.`,
      "",
      isNew ? "Datos del perfil:" : "Campos modificados:",
      ...changedFields.map((key) => `- ${key}: ${formatValue(after[key])}`),
    ];

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: SENDER_EMAIL, pass: gmailAppPassword.value() },
    });

    await transporter.sendMail({
      from: `Wrestling Performance Lab <${SENDER_EMAIL}>`,
      to: COACH_EMAIL,
      subject,
      text: bodyLines.join("\n"),
    });
  }
);
