import { describe, it, expect } from "vitest";
import { decodeMail, stripHtml } from "@/lib/ingestion/email/mime";

const INNER_1 = [
  "From: notificacionbac@baccredomatic.cr",
  "To: memogrg@gmail.com",
  "Subject: Notificacion de transaccion SUBWAY LAGUNILLA 04-09-2026 - 12:10",
  "Date: Fri, 04 Sep 2026 12:10:00 -0600",
  "Message-ID: <inner1@bac>",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Comercio: SUBWAY LAGUNILLA",
  "Monto: CRC 5,150.00",
  "",
].join("\r\n");

const INNER_2 = [
  "From: notificacionbac@baccredomatic.cr",
  "To: memogrg@gmail.com",
  "Subject: Notificacion de transaccion AM PM LAGUNILLA 04-09-2026 - 18:40",
  "Date: Fri, 04 Sep 2026 18:40:00 -0600",
  "Message-ID: <inner2@bac>",
  "Content-Type: text/html; charset=utf-8",
  "",
  "<html><head><style>.x{color:red}</style></head><body><table><tr><td>Comercio:</td><td>AM PM LAGUNILLA</td></tr><tr><td>Monto:</td><td>CRC 1,700.00</td></tr></table></body></html>",
  "",
].join("\r\n");

/** Lo que manda Gmail con «Reenviar como archivo adjunto»: cuerpo vacío + N adjuntos message/rfc822. */
const OUTER = [
  "From: memogrg@gmail.com",
  "To: u2g5zmfs5w2@in.aitechumbrella.com",
  "Subject: Fwd: avisos de setiembre",
  "Date: Sat, 05 Sep 2026 10:00:00 -0600",
  "Message-ID: <outer@gmail>",
  'Content-Type: multipart/mixed; boundary="B1"',
  "",
  "--B1",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "",
  "--B1",
  "Content-Type: message/rfc822",
  "Content-Disposition: attachment",
  "",
  INNER_1,
  "--B1",
  'Content-Type: message/rfc822; name="Notificacion.eml"',
  'Content-Disposition: attachment; filename="Notificacion.eml"',
  "",
  INNER_2,
  "--B1--",
  "",
].join("\r\n");

describe("mime · decodeMail", () => {
  it("un correo normal: cuerpo, remitente, asunto, fecha, sin adjuntos", async () => {
    const d = await decodeMail(Buffer.from(INNER_1));
    expect(d.from).toBe("notificacionbac@baccredomatic.cr");
    expect(d.subject).toContain("SUBWAY LAGUNILLA");
    expect(d.text).toContain("Monto: CRC 5,150.00");
    expect(d.date).toBe("2026-09-04T18:10:00.000Z");
    expect(d.messageId).toBe("<inner1@bac>");
    expect(d.attached).toEqual([]);
  });

  it("«reenviar como archivo adjunto»: abre cada .eml con su remitente, fecha y cuerpo", async () => {
    const d = await decodeMail(Buffer.from(OUTER));
    expect(d.from).toBe("memogrg@gmail.com");
    expect(d.attached).toHaveLength(2);
    const [a, b] = d.attached;
    expect(a!.from).toBe("notificacionbac@baccredomatic.cr");
    expect(a!.messageId).toBe("<inner1@bac>");
    expect(a!.text).toContain("CRC 5,150.00");
    expect(a!.date).toBe("2026-09-04T18:10:00.000Z");
    // El HTML del segundo se convierte a texto y la hoja de estilos NO se cuela.
    expect(b!.text).toContain("AM PM LAGUNILLA");
    expect(b!.text).toContain("CRC 1,700.00");
    expect(b!.text).not.toContain("color:red");
  });
});

describe("mime · stripHtml", () => {
  it("descarta <style>/<script>/<head> y decodifica entidades", () => {
    const t = stripHtml(
      "<head><style>.a{}</style></head><body><p>Monto: CRC&nbsp;4,350.00</p><script>x()</script>Tom &amp; Jerry</body>",
    );
    expect(t).toBe("Monto: CRC 4,350.00\nTom & Jerry");
  });
});
