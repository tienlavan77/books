/* Provides module implementation and exported declarations for page.js. */

import { redirect } from "next/navigation";
import { getServerOwnerSession } from "@/lib/auth";
import { listBooksWithProgress } from "@/lib/books-repo";
import { serializeBookForClient } from "@/lib/upload-service";
import LibraryClient from "@/components/LibraryClient";

export const dynamic = "force-dynamic";

/* Executes documented symbol logic in page.js. */
export default async function Home() {
  const session = await getServerOwnerSession();
  if (!session) {
    redirect("/login");
  }

  const books = await listBooksWithProgress({ search: "", sort: "recent" });
  const serializedBooks = books.map((book) => serializeBookForClient(book));

  return <LibraryClient initialBooks={serializedBooks} owner={session} />;
}
