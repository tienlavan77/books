/* Provides module implementation and exported declarations for page.js. */

import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerOwnerSession } from "@/lib/auth";
import { findBookById } from "@/lib/books-repo";
import { serializeBookForClient } from "@/lib/upload-service";
import ReaderClientWrapper from "@/components/ReaderClientWrapper";

export const dynamic = "force-dynamic";

/* Executes documented symbol logic in page.js. */
export default async function ReaderPage({ params }) {
  const { id } = await params;
  const session = await getServerOwnerSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/reader/${id}`)}`);
  }

  const book = await findBookById(id);
  if (!book) {
    return (
      <div className="reader-shell">
        <div className="reader-error-box">
          <h2>Không tìm thấy cuốn sách này</h2>
          <p>Cuốn sách có thể đã bị xóa hoặc đường dẫn không hợp lệ.</p>
          <Link href="/" className="btn-primary">
            Quay về thư viện
          </Link>
        </div>
      </div>
    );
  }

  const serializedBook = serializeBookForClient(book);
  return <ReaderClientWrapper initialBook={serializedBook} />;
}
