// @ts-check
/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  tutorialSidebar: [
    "intro",
    "install",
    "getting-started",
    "conformance-tiers",
    {
      type: "category",
      label: "Reference",
      items: ["reference/architecture", "reference/llm-dispatcher"],
    },
  ],
};

export default sidebars;
