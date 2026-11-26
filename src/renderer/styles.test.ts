import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// The cases of SPEC-0004, "Tests", "Unit", `styles.test.ts`: the stylesheets of the view author no color, only the
// tokens of the theme and `transparent` (P21; kit, `docs/design.md`, "Theme"); the columns of state keep their room in
// a narrow window while those of the domain give theirs, the class and the version first and the name last (P7); and
// no cell of the list holds more than one line (kit, `docs/design.md`, "Lists"; P12).

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

// The declarations of a rule, before the first rule nested in it.
function declarationsOf(text: string, selector: string): string {
  const start = text.indexOf(`${selector} {`);

  if (start === -1) return "";

  const body = text.slice(start + selector.length + 2);
  const end = body.search(/[{}]/);

  return body
    .slice(0, end)
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("&"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("the cells of the list (P12; kit, Lists)", () => {
  const page = readFileSync(join(RENDERER, "pages", "clusters-page.module.scss"), "utf8");
  const marks = readFileSync(join(RENDERER, "components", "marks.module.scss"), "utf8");

  it("hold one line: the cells of the list do not wrap and cut what overflows", () => {
    const cells = declarationsOf(page, ":global(.Table) :global(.TableCell)");

    expect(cells).toMatch(/white-space: nowrap;/);
    expect(cells).toMatch(/overflow: hidden;/);
  });

  it("hold their marks on one line, cut with an ellipsis", () => {
    const cell = declarationsOf(marks, ".cell");

    expect(cell).toMatch(/white-space: nowrap;/);
    expect(cell).toMatch(/overflow: hidden;/);
    expect(cell).toMatch(/text-overflow: ellipsis;/);
  });

  it("have their head cut as they are, in the badge of each title: the box of the host that holds it has no minimum width", () => {
    expect(declarationsOf(page, ".list :global(.TableHead) :global(.TableCell) > :global(.content)")).toBe(
      "min-width: 0;",
    );
  });

  it("line the note of a cell up with the marks before it, each at the middle of the line", () => {
    expect(declarationsOf(marks, ".cell > .mark,\n.cell > .note")).toBe("vertical-align: middle;");
  });

  it.each([
    ["pages/clusters-page.module.scss", () => page],
    ["components/marks.module.scss", () => marks],
  ])("%s lets nothing wrap, but in a tooltip", (_name, text) => {
    const outsideTooltips = text().replace(/\.tooltip \{[^}]*\}/g, "");

    expect(outsideTooltips).not.toMatch(/flex-wrap:\s*wrap/);
    expect(outsideTooltips.match(/white-space:\s*[\w-]+/g)?.filter((value) => !/nowrap$/.test(value)) ?? []).toEqual(
      [],
    );
  });
});

describe("the focus of the buttons of the view (kit, Interaction and performance)", () => {
  const page = readFileSync(join(RENDERER, "pages", "clusters-page.module.scss"), "utf8");
  const details = readFileSync(join(RENDERER, "details", "cluster-details.module.scss"), "utf8");

  // The host takes the outline away from every element, so each button of the view draws its focus itself, in a token
  // of the theme and inside its box, which the badge that holds the name would otherwise cut.
  it.each([
    ["the name of a row", () => page, ".nameButton:focus-visible"],
    ["a Cluster named in a message", () => details, ".textButton:focus-visible"],
  ])("draws the focus of %s with a token of the theme, inside its box", (_name, text, selector) => {
    const rule = declarationsOf(text(), selector);

    expect(rule).toMatch(/outline: 2px solid var\(--[\w-]+\);/);
    expect(rule).toMatch(/outline-offset: -2px;/);
  });
});

describe("the labels of the conditions in the details", () => {
  // A long name wraps in the column of the labels of the host, so that the marks of its row stay in line.
  it("wrap anywhere in a name that the column does not hold", () => {
    const details = readFileSync(join(RENDERER, "details", "cluster-details.module.scss"), "utf8");

    expect(declarationsOf(details, ".condition > :global(.name)")).toBe("overflow-wrap: anywhere;");
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

  it("of the domain give their room before the name, the identity of the row, which shrinks the least", () => {
    for (const name of domain.filter((column) => column !== "name")) {
      expect(columns.get("name")?.shrink, name).toBeLessThan(columns.get(name)?.shrink ?? 0);
    }
  });
});
