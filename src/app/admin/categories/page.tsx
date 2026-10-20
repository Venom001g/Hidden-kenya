import type { Metadata } from "next";
import { Suspense } from "react";
import { saveCategory } from "@/actions/admin";
import { DashboardSkeleton, Section } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/ui/feedback";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { requireAdmin } from "@/lib/data/admin";

export const metadata: Metadata = { title: "Categories" };

async function Content() {
  const { db } = await requireAdmin("/admin/categories");
  const { data: cats } = await db.from("experience_categories").select("*").order("sort_order");
  return (
    <div className="space-y-6">
      <PageHeader title="Categories" description="Types of experience used for search and navigation. Turn off a category instead of deleting it." />
      {(cats ?? []).map((c) => (
        <Section key={c.id} title={c.name}>
          <ActionForm action={saveCategory} className="grid gap-4 sm:grid-cols-[1fr_2fr_6rem] sm:items-end">
            <input type="hidden" name="id" value={c.id} />
            <Field id={`n-${c.id}`} label="Name">
              <Input id={`n-${c.id}`} name="name" defaultValue={c.name} required maxLength={60} />
            </Field>
            <Field id={`d-${c.id}`} label="Description">
              <Input id={`d-${c.id}`} name="description" defaultValue={c.description} maxLength={300} />
            </Field>
            <Field id={`o-${c.id}`} label="Order">
              <Input id={`o-${c.id}`} name="sortOrder" type="number" defaultValue={c.sort_order} />
            </Field>
            <label className="flex items-center gap-2">
              <Checkbox name="isActive" defaultChecked={c.is_active} /> Active
            </label>
            <SubmitButton size="sm" variant="secondary" className="w-fit">
              Save
            </SubmitButton>
          </ActionForm>
        </Section>
      ))}
      <Section title="Add a category">
        <ActionForm action={saveCategory} className="grid gap-4 sm:grid-cols-[1fr_2fr_6rem] sm:items-end" resetOnSuccess>
          <Field id="new-name" label="Name">
            <Input id="new-name" name="name" required maxLength={60} />
          </Field>
          <Field id="new-desc" label="Description">
            <Input id="new-desc" name="description" maxLength={300} />
          </Field>
          <Field id="new-order" label="Order">
            <Input id="new-order" name="sortOrder" type="number" defaultValue={100} />
          </Field>
          <input type="hidden" name="isActive" value="on" />
          <SubmitButton size="sm" className="w-fit">
            Add category
          </SubmitButton>
        </ActionForm>
      </Section>
    </div>
  );
}

export default function AdminCategoriesPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content />
    </Suspense>
  );
}
