import { Link } from "react-router";
import { Card, PageTitle, buttonClass, cx } from "./ui";

export function NotFound({ home }: { home: string }) {
  return (
    <Card className="text-center">
      <PageTitle title="Tidak ditemukan" />
      <p className="font-semibold">Halaman tidak ditemukan</p>
      <Link to={home} className={cx(buttonClass("primary"), "mt-4")}>
        Ke halaman utama
      </Link>
    </Card>
  );
}
