/**
 * Homepage: just redirect to /intro so the navbar title + footer "Docs →"
 * links work. When the docs-site grows a real marketing landing page
 * (M11), replace this with that component.
 */
import React from "react";
import { Redirect } from "@docusaurus/router";

export default function Home() {
  return <Redirect to="/intro" />;
}
