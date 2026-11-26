import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// The cases of SPEC-0004, "Tests", "Unit", `styles.test.ts`: the stylesheets of the view author no color, only the
// tokens of the theme and `transparent` (P21; kit, `docs/design.md`, "Theme"), and the columns of state keep their
// room in a narrow window while those of the domain give theirs, the class and the version first (P7).

const RENDERER = join(process.cwd(), "src", "renderer");

function stylesheets(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);

    if (statSync(path).isDirectory()) return stylesheets(path);
    return /\.(s?css)$/.test(name) ? [path] : [];
  });
}

// The named colors of CSS, which a stylesheet of the view never writes.
const NAMED_COLORS =
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown
burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray
darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue
darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite
forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory
khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen
lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime
limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue
mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive
olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue
slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke
yellow yellowgreen`.split(/\s+/);

// The colors that a stylesheet writes other than through a token or `transparent`.
function colorsOf(text: string): string[] {
  const values = [...text.matchAll(/^\s*[-\w]+\s*:\s*([^;{}]+);/gm)].map((match) => match[1]);
  const found: string[] = [];

  for (const value of values) {
    const bare = value.replace(/var\(--[\w-]+\)/g, "").replace(/--[\w-]+/g, "");

    found.push(...(bare.match(/#[0-9a-f]{3,8}\b/gi) ?? []));
    found.push(...(bare.match(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi) ?? []));
    found.push(...bare.split(/[^a-z]+/i).filter((word) => NAMED_COLORS.includes(word.toLowerCase())));
  }
  return found;
}

// The flex of each column of the list, from the classes of the head cells that the layout copies to the cells.
function columnsOf(text: string): Map<string, { grow: number; shrink: number; basis: string; minWidth?: string }> {
  const columns = new Map<string, { grow: number; shrink: number; basis: string; minWidth?: string }>();

  for (const match of text.matchAll(/((?:&\.\w+\s*,?\s*)+)\{([^}]*)\}/g)) {
    const flex = /flex:\s*([\d.]+)\s+([\d.]+)\s+([^;]+);/.exec(match[2]);
    const minWidth = /min-width:\s*([^;]+);/.exec(match[2])?.[1];

    if (!flex) continue;
    for (const name of match[1].matchAll(/&\.(\w+)/g)) {
      columns.set(name[1], { grow: Number(flex[1]), shrink: Number(flex[2]), basis: flex[3].trim(), minWidth });
    }
  }
  return columns;
}

describe("the stylesheets of the view", () => {
  const files = stylesheets(RENDERER);

  it("are found", () => {
    expect(files.map((file) => relative(RENDERER, file)).sort()).toEqual(
      expect.arrayContaining([
        join("components", "marks.module.scss"),
        join("components", "notice.module.scss"),
        join("pages", "clusters-page.module.scss"),
      ]),
    );
  });

  it.each(files.map((file) => [relative(RENDERER, file), file]))(
    "%s holds no color but tokens and transparent",
    (_name, file) => {
      expect(colorsOf(readFileSync(file, "utf8"))).toEqual([]);
    },
  );

  it("see a color written out", () => {
    expect(colorsOf(".a {\n  color: #fff;\n  border: 1px solid red;\n  background: rgb(0 0 0);\n}")).toEqual([
      "#fff",
      "red",
      "rgb(",
    ]);
  });
});

describe("the columns of the list (P7)", () => {
  const columns = columnsOf(readFileSync(join(RENDERER, "pages", "clusters-page.module.scss"), "utf8"));
  const state = ["activity", "condition", "status"];
  const domain = ["name", "namespace", "controlPlane", "workers", "version", "clusterClass", "age"];

  it("of state keep a minimum width and never shrink", () => {
    for (const name of state) {
      expect(columns.get(name)?.shrink, name).toBe(0);
      expect(columns.get(name)?.minWidth, name).toBeDefined();
    }
  });

  it("of the domain shrink, the class and the version the most", () => {
    const shrinks = domain.map((name) => columns.get(name)?.shrink ?? 0);
    const others = domain.filter((name) => name !== "version" && name !== "clusterClass");

    expect(shrinks.every((shrink) => shrink > 0)).toBe(true);
    for (const name of others) {
      expect(columns.get("version")?.shrink).toBeGreaterThan(columns.get(name)?.shrink ?? 0);
      expect(columns.get("clusterClass")?.shrink).toBeGreaterThan(columns.get(name)?.shrink ?? 0);
    }
  });
});
