import { requireAdminPage } from "@/lib/admin/auth";
import BlogClient from "./BlogClient";

export const dynamic = "force-dynamic";

export default async function AdminBlogPage() {
  await requireAdminPage();
  return <BlogClient />;
}
