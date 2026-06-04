import { helper } from "./b";
import { u } from "@app/util";
import React from "react";
import { gone } from "./missing";

export function add(x: number, y: number): number {
  return helper(x) + y + u + (React ? 0 : 1) + (gone ? 0 : 1);
}

function local(): number {
  return add(1, 2);
}

export const square = (n: number): number => local() * n;
