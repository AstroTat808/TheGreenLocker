/**
 * Account-linked concept card identity.
 * Card identifiers are stable, randomly assigned display references: NOT auth tokens.
 * The SVG export is available only through the existing authenticated private server.
 */
import { randomBytes } from "node:crypto";

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[char]));

const codePattern = /^GL-(?:[A-F0-9]{4}-){3}[A-F0-9]{4}$/;

export function ensureMemberCode(db,userId) {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("Invalid member account.");
  const select = db.prepare("SELECT member_code FROM users WHERE id=?");
  const current = select.get(userId);
  if (!current) throw new Error("Member account not found.");
  if (current.member_code) {
    if (!codePattern.test(current.member_code)) throw new Error("Invalid stored member code.");
    return current.member_code;
  }
  for (let attempt=0;attempt<6;attempt++) {
    const random = randomBytes(8).toString("hex").toUpperCase();
    const code = "GL-" + random.match(/.{4}/g).join("-");
    try {
      db.prepare("UPDATE users SET member_code=? WHERE id=? AND member_code IS NULL").run(code,userId);
      const saved = select.get(userId)?.member_code;
      if (saved && codePattern.test(saved)) return saved;
    } catch (error) {
      if (!String(error?.message ?? "").includes("UNIQUE constraint")) throw error;
    }
  }
  throw new Error("Unable to allocate member card reference.");
}

export function renderMemberCardSvg({displayName,memberCode,logoBase64}) {
  if (!codePattern.test(memberCode)) throw new Error("Invalid card reference.");
  if (!/^[A-Za-z0-9+/=]+$/.test(logoBase64 ?? "")) throw new Error("Invalid logo data.");
  const rawName = String(displayName ?? "Member");
  const name = esc(rawName);
  const code = esc(memberCode);
  const nameSize = [...rawName].length > 36 ? 40 : [...rawName].length > 25 ? 48 : 64;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720" role="img" aria-label="The Green Locker private concept member card">',
    '<defs>',
      '<linearGradient id="card-bg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#092e1b"/><stop offset=".52" stop-color="#04180e"/><stop offset="1" stop-color="#020a06"/></linearGradient>',
      '<linearGradient id="card-gold" x1="0" x2="1"><stop stop-color="#a98243"/><stop offset=".5" stop-color="#f4da9b"/><stop offset="1" stop-color="#a47b41"/></linearGradient>',
      '<radialGradient id="card-halo"><stop stop-color="#3b7850" stop-opacity=".8"/><stop offset=".42" stop-color="#1f4930" stop-opacity=".24"/><stop offset="1" stop-color="#061a10" stop-opacity="0"/></radialGradient>',
      '<pattern id="card-grid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M 60 0 L 0 0 0 60" fill="none" stroke="#d6b275" stroke-opacity=".065" stroke-width="1"/></pattern>',
    '</defs>',
    '<rect x="0" y="0" width="1200" height="720" rx="28" fill="url(#card-bg)"/>',
    '<rect x="0" y="0" width="1200" height="720" rx="28" fill="url(#card-grid)"/>',
    '<circle cx="905" cy="325" r="410" fill="url(#card-halo)"/>',
    '<g fill="none" stroke="#d9b67e" stroke-opacity=".25">',
      '<circle cx="944" cy="324" r="276" stroke-width="2"/>',
      '<circle cx="944" cy="324" r="224" stroke-width="1.5" stroke-dasharray="6 12"/>',
      '<circle cx="944" cy="324" r="182" stroke-width="3"/>',
      '<path d="M 944 48 L 944 600 M 668 324 L 1200 324" stroke-opacity=".1"/>',
    '</g>',
    '<rect x="24" y="24" width="1152" height="672" rx="18" stroke="url(#card-gold)" stroke-width="2" fill="none"/>',
    '<rect x="42" y="42" width="1116" height="636" rx="13" stroke="#d6af6b" stroke-opacity=".34" fill="none"/>',
    '<path d="M 78 260 L 1122 260" stroke="#e6bd78" stroke-opacity=".22" stroke-width="2"/>',
    '<image x="75" y="68" width="157" height="157" href="data:image/webp;base64,',logoBase64,'"/>',
    '<text x="265" y="126" fill="#f5dfae" font-family="Georgia,serif" font-size="52" letter-spacing="2">THE GREEN LOCKER</text>',
    '<text x="268" y="173" fill="#d7b376" font-family="Arial,Helvetica,sans-serif" font-size="19" letter-spacing="6">PRIVATE MEMBER · DIGITAL CREDENTIAL</text>',
    '<text x="84" y="337" fill="#dec28d" font-family="Arial,Helvetica,sans-serif" font-size="17" letter-spacing="4">MEMBER NAME</text>',
    '<text x="84" y="415" fill="#fff0c8" font-family="Georgia,serif" font-size="',String(nameSize),'" letter-spacing="-1">',name,'</text>',
    '<path d="M 82 466 H 624" stroke="url(#card-gold)" stroke-width="3"/>',
    '<text x="84" y="519" fill="#dec28d" font-family="Arial,Helvetica,sans-serif" font-size="17" letter-spacing="4">MEMBER REFERENCE</text>',
    '<text x="84" y="567" fill="#f6d89b" font-family="Arial,Helvetica,sans-serif" font-size="30" letter-spacing="3">',code,'</text>',
    '<text x="84" y="648" fill="#b2bdac" font-family="Arial,Helvetica,sans-serif" font-size="15" letter-spacing="2">PRIVATE DESIGN PREVIEW · NOT A LOGIN CREDENTIAL · NO SALES</text>',
    '<path d="M 700 653 H 1111" stroke="#c89d56" stroke-opacity=".5"/>',
    '</svg>'
  ].join("");
}
