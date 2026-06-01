import { createFileRoute } from "@tanstack/react-router";
import { GuidePage } from "@/features/guide/GuidePage";

export const Route = createFileRoute("/_app/guide")({
  head: () => ({ meta: [{ title: "Guide — Astra Intelligence" }] }),
  component: GuidePage,
});
