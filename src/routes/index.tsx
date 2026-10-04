import { createFileRoute } from "@tanstack/react-router";
import { InvestApp } from "@/components/invest-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <InvestApp />;
}
