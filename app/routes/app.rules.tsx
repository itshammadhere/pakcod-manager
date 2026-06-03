import type { HeadersFunction, LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit } from "react-router";
import { Page, Card, BlockStack, Text, Button, Badge, Banner, Box, InlineStack } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getRules } from "../models/rules.server";

const RULE_TYPES = [
  { label: "Max Order Value", value: "max_value" },
  { label: "Min Order Value", value: "min_value" },
  { label: "City Restriction", value: "city" },
  { label: "Phone Prefix", value: "phone_prefix" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const rules = await getRules(session.shop);
  return { rules, ruleTypes: RULE_TYPES };
};

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  if (intent === "add") {
    await prisma.codRule.create({
      data: {
        shop: session.shop,
        ruleType: formData.get("ruleType")?.toString() || "",
        operator: formData.get("operator")?.toString() || "gt",
        value: formData.get("value")?.toString() || "",
        action: formData.get("action")?.toString() || "block",
      },
    });
  }

  if (intent === "toggle") {
    const rule = await prisma.codRule.findUnique({ where: { id: formData.get("ruleId")?.toString() || "" } });
    if (rule) {
      await prisma.codRule.update({
        where: { id: rule.id },
        data: { isActive: !rule.isActive },
      });
    }
  }

  if (intent === "delete") {
    await prisma.codRule.delete({ where: { id: formData.get("ruleId")?.toString() || "" } });
  }

  return null;
}

export default function RulesPage() {
  const data = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [ruleType, setRuleType] = useState("max_value");
  const [operator, setOperator] = useState("gt");
  const [value, setValue] = useState("");

  function handleSubmit(intent: string, extra?: Record<string, string>) {
    const fd = new FormData();
    fd.set("intent", intent);
    if (intent === "add") {
      fd.set("ruleType", ruleType);
      fd.set("operator", operator);
      fd.set("value", value);
    }
    if (extra) {
      Object.entries(extra).forEach(([k, v]) => fd.set(k, v));
    }
    submit(fd, { method: "post" });
  }

  const operatorOptions = ruleType === "phone_prefix" || ruleType === "city"
    ? [{ label: "Starts With", value: "starts" }, { label: "Equals", value: "equals" }]
    : [{ label: "Greater Than", value: "gt" }, { label: "Less Than", value: "lt" }, { label: "Equals", value: "equals" }];

  return (
    <Page title="COD Rules">
      <TitleBar title="COD Rules" />
      <BlockStack gap="500">
        <Card>
          <Text variant="headingMd" as="h3">Add New Rule</Text>
          <Box paddingBlockStart="400">
            <BlockStack gap="300">
              <InlineStack gap="300" wrap>
                <select
                  value={ruleType}
                  onChange={(e) => setRuleType(e.target.value)}
                  style={{ padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                >
                  {RULE_TYPES.map((rt) => (
                    <option key={rt.value} value={rt.value}>{rt.label}</option>
                  ))}
                </select>
                <select
                  value={operator}
                  onChange={(e) => setOperator(e.target.value)}
                  style={{ padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                >
                  {operatorOptions.map((op) => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder={ruleType === "city" ? "e.g. Karachi" : ruleType === "phone_prefix" ? "e.g. 0300" : "e.g. 5000"}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  style={{ padding: "8px", borderRadius: "6px", border: "1px solid #ccc", width: "200px" }}
                />
                <Button onClick={() => handleSubmit("add")}>Add Rule</Button>
              </InlineStack>
            </BlockStack>
          </Box>
        </Card>

        <Card>
          <Text variant="headingMd" as="h3">Active Rules</Text>
          <Box paddingBlockStart="400">
            <BlockStack gap="300">
              {data.rules.length > 0 ? data.rules.map((rule) => (
                <Box key={rule.id} padding="300" borderRadius="200" background="bg-surface-secondary">
                  <InlineStack gap="200" align="space-between" wrap>
                    <InlineStack gap="200" wrap>
                      <Badge tone={rule.isActive ? "success" : "attention"}>
                        {rule.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <Text fontWeight="bold" as="span">{rule.ruleType.replace("_", " ")}</Text>
                      <Text as="span">{rule.operator} {rule.value}</Text>
                      <Badge tone={rule.action === "block" ? "critical" : "info"}>{rule.action}</Badge>
                    </InlineStack>
                    <InlineStack gap="200">
                      <Button size="slim" onClick={() => handleSubmit("toggle", { ruleId: rule.id })}>
                        {rule.isActive ? "Disable" : "Enable"}
                      </Button>
                      <Button size="slim" tone="critical" onClick={() => handleSubmit("delete", { ruleId: rule.id })}>
                        Delete
                      </Button>
                    </InlineStack>
                  </InlineStack>
                </Box>
              )) : (
                <Text as="p" tone="subdued">No rules configured yet.</Text>
              )}
            </BlockStack>
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
