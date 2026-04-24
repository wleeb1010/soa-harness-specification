// @ts-check
// Docusaurus config for the SOA-Harness docs site (M7 MVP per L-62 night shift).
//
// This is a minimum-viable config — enough to `npm install && npm run build`
// into a static site. M11 will wire deployment (GitHub Pages / Netlify /
// self-hosted) and versioned docs per release. Today the goal is: adopter
// can clone this repo, `cd docs-site && npm install && npm start`, and see
// the rendered docs on localhost.

import { themes as prismThemes } from "prism-react-renderer";

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "SOA-Harness",
  tagline: "Secure Operating Agents — a specification + reference implementation for production-grade agent runtimes",
  favicon: "img/favicon.ico",

  // Set to the canonical URL once the site lands on a public host (M11).
  url: "https://soa-harness.example",
  baseUrl: "/",

  // GitHub Pages deploy metadata (inert until M11).
  organizationName: "wleeb1010",
  projectName: "soa-harness-specification",

  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "warn",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: "./sidebars.js",
          routeBasePath: "/",
          // Point "Edit this page" at the spec repo.
          editUrl: "https://github.com/wleeb1010/soa-harness-specification/tree/main/docs-site/",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: "SOA-Harness",
        items: [
          {
            type: "docSidebar",
            sidebarId: "tutorialSidebar",
            position: "left",
            label: "Docs",
          },
          {
            href: "https://github.com/wleeb1010/soa-harness-specification",
            label: "Spec",
            position: "right",
          },
          {
            href: "https://github.com/wleeb1010/soa-harness-impl",
            label: "Impl",
            position: "right",
          },
          {
            href: "https://github.com/wleeb1010/soa-validate",
            label: "Validator",
            position: "right",
          },
        ],
      },
      footer: {
        style: "dark",
        links: [
          {
            title: "Docs",
            items: [
              { label: "Introduction", to: "/intro" },
              { label: "Install", to: "/install" },
              { label: "Getting Started", to: "/getting-started" },
              { label: "Conformance Tiers", to: "/conformance-tiers" },
            ],
          },
          {
            title: "Repositories",
            items: [
              { label: "Spec (normative)", href: "https://github.com/wleeb1010/soa-harness-specification" },
              { label: "Impl (reference)", href: "https://github.com/wleeb1010/soa-harness-impl" },
              { label: "Validator", href: "https://github.com/wleeb1010/soa-validate" },
            ],
          },
          {
            title: "npm",
            items: [
              { label: "@soa-harness/runner", href: "https://www.npmjs.com/package/@soa-harness/runner" },
              { label: "create-soa-agent", href: "https://www.npmjs.com/package/create-soa-agent" },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} SOA-Harness. Built with Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
