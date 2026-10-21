import SettingsTabs from "@/components/SettingsTabs";

// Settings has four pages, shown as tabs above whichever one is open (Define ICP is the default).
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <><SettingsTabs />{children}</>;
}
