import Link from "next/link";
import UserMenu from "@/app/components/UserMenu";

type Props = {
  email: string | null;
  children: React.ReactNode;
};

function NavItem({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        padding: "10px 12px",
        borderRadius: 12,
        color: "#111827",
        textDecoration: "none",
        fontWeight: 600,
      }}
    >
      {label}
    </Link>
  );
}

export default function CrmShell({ email, children }: Props) {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#f3f4f6",
      }}
    >
      <aside
        style={{
          width: 260,
          background: "#ffffff",
          borderRight: "1px solid #e5e7eb",
          padding: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontWeight: 800 }}>Liftygo CRM</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>MVP</div>
          </div>
          <UserMenu email={email} />
        </div>

        <nav style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <NavItem href="/dashboard" label={'דשבורד מנכ"ל'} />
          <NavItem href="/contacts" label="אנשי קשר" />
          <NavItem href="/pipeline" label="ניהול הזדמנויות" />
          <NavItem href="/settings" label="הגדרות" />
        </nav>
      </aside>

      <section
        style={{
          flex: 1,
          minWidth: 0,
          maxWidth: "100%",
          overflowX: "hidden",
          padding: 18,
        }}
      >
        {children}
      </section>
    </div>
  );
}

