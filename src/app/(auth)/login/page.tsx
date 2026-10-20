import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert } from "@/components/ui/feedback";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

async function Notice({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <>
      {sp.error === "link_expired" ? (
        <Alert tone="warning" className="mb-6">
          That link has expired or was already used. Sign in, or request a new link.
        </Alert>
      ) : null}
      <LoginForm next={next} />
    </>
  );
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Sign in</h1>
        <p className="mt-2 text-stone">
          New to Hidden Kenya?{" "}
          <Link href="/signup" className="text-forest underline underline-offset-4">
            Create an account
          </Link>
        </p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-[var(--radius-card)] bg-sand/50" />}>
        <Notice searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
