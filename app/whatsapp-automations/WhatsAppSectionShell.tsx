import WhatsAppSubNav from "@/app/whatsapp-automations/WhatsAppSubNav";

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export default function WhatsAppSectionShell({ title, subtitle, children }: Props) {
  return (
    <div style={{ maxWidth: 1180, width: "100%" }}>
      <WhatsAppSubNav />
      <h1 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 900 }}>{title}</h1>
      {subtitle ? (
        <p style={{ margin: "0 0 20px", color: "#4b5563", lineHeight: 1.55, fontSize: 14 }}>{subtitle}</p>
      ) : (
        <div style={{ marginBottom: 16 }} />
      )}
      {children}
    </div>
  );
}
