import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

async function Form({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return <SignupForm intent={sp.intent === "host" ? "host" : "guest"} />;
}

export default function SignupPage(props: PageProps<"/signup">) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Create an account</h1>
        <p className="mt-2 text-stone">
          Already registered?{" "}
          <Link href="/login" className="text-forest underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-sand/50" />}>
        <Form searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
