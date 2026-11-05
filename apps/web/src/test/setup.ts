import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Async UI assertions get headroom on slow or busy CI machines.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => cleanup());
