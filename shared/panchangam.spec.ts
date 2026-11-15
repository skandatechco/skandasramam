import { describe, expect, it } from "vitest";
import {
  NAKSHATRAS,
  TITHIS,
  canonNakshatra,
  canonPaksha,
  canonTithi,
  evaluateRule,
  evaluateRules,
  normalisePanchangam,
} from "./panchangam";

describe("canonical vocabularies", () => {
  it("has 16 tithi ids (15 + new moon) and 27 nakshatras, all unique", () => {
    expect(TITHIS).toHaveLength(16);
    expect(NAKSHATRAS).toHaveLength(27);
    expect(new Set(TITHIS).size).toBe(16);
    expect(new Set(NAKSHATRAS).size).toBe(27);
  });
  it("every canonical id is reachable from at least its own spelling", () => {
    for (const t of TITHIS) expect(canonTithi(t)).toBe(t);
    for (const n of NAKSHATRAS)
      expect(canonNakshatra(n.replace(/_/g, " "))).toBe(n);
  });
});

describe("canonTithi", () => {
  it.each([
    ["Trayodashi", "trayodashi"],
    ["trayodasi", "trayodashi"],
    ["Thirayodasi", "trayodashi"],
    ["Pournami", "purnima"],
    ["Purnima", "purnima"],
    ["Full Moon", "purnima"],
    ["Amavasya", "amavasya"],
    ["Amavasai", "amavasya"],
    ["New Moon", "amavasya"],
    ["Krishna Chaturthi", "chaturthi"],
    ["Shukla Paksha Ashtami", "ashtami"],
    ["Chaturdasi", "chaturdashi"],
    ["Panchami", "panchami"],
  ])("%s -> %s", (text, id) => expect(canonTithi(text)).toBe(id));

  it("is null (ambiguous) for empty, unknown or multiple tithis", () => {
    for (const t of [
      null,
      undefined,
      "",
      "Tuesday",
      "Chaturthi / Panchami",
      "12:30",
    ]) {
      expect(canonTithi(t as any)).toBeNull();
    }
  });
  it("does not confuse similar tithis", () => {
    expect(canonTithi("Chaturthi")).toBe("chaturthi");
    expect(canonTithi("Chaturdashi")).toBe("chaturdashi");
    expect(canonTithi("Dashami")).toBe("dashami");
    expect(canonTithi("Ekadashi")).toBe("ekadashi");
    expect(canonTithi("Navami")).toBe("navami");
  });
});

describe("canonPaksha", () => {
  it("reads either spelling and Tamil terms", () => {
    expect(canonPaksha("Shukla Paksha")).toBe("shukla");
    expect(canonPaksha("Krishna")).toBe("krishna");
    expect(canonPaksha("Valarpirai")).toBe("shukla");
    expect(canonPaksha("Theipirai")).toBe("krishna");
  });
  it("is null when missing or contradictory", () => {
    expect(canonPaksha(null)).toBeNull();
    expect(canonPaksha("")).toBeNull();
    expect(canonPaksha("Shukla Krishna")).toBeNull();
  });
});

describe("canonNakshatra", () => {
  it.each([
    ["Rohini", "rohini"],
    ["Krittika", "krittika"],
    ["Karthigai", "krittika"],
    ["Krithigai", "krittika"],
    ["Uttara Phalguni", "uttara_phalguni"],
    ["Uthiram", "uttara_phalguni"],
    ["Chithirai", "chitra"],
    ["Swathi", "swati"],
    ["Visakam", "vishakha"],
    ["Vishagam", "vishakha"],
    ["Purva Bhadrapada", "purva_bhadrapada"],
    ["Rohini (Pada 2)", "rohini"],
    ["REVATHI", "revati"],
  ])("%s -> %s", (text, id) => expect(canonNakshatra(text)).toBe(id));

  it("is null when two different nakshatras are named (the star changes in the day)", () => {
    expect(canonNakshatra("Ardra / Punarvasu")).toBeNull();
    expect(canonNakshatra("Bharani, Krittika")).toBeNull();
    expect(canonNakshatra("Rohini and Mrigashira")).toBeNull();
  });
  it("accepts the same nakshatra named twice, and rejects unknown text", () => {
    expect(canonNakshatra("Rohini / Rohini")).toBe("rohini");
    expect(canonNakshatra("Rohini / Whatever")).toBeNull();
    expect(canonNakshatra("")).toBeNull();
    expect(canonNakshatra(null)).toBeNull();
  });
});

describe("normalisePanchangam", () => {
  it("combines the columns", () => {
    expect(
      normalisePanchangam({
        tithi: "Trayodashi",
        paksha: "Shukla Paksha",
        nakshatra: "Rohini",
      }),
    ).toEqual({
      tithi: "trayodashi",
      paksha: "shukla",
      nakshatra: "rohini",
    });
  });
  it("takes paksha from the tithi text when the column is empty", () => {
    expect(
      normalisePanchangam({
        tithi: "Krishna Chaturthi",
        paksha: "",
        nakshatra: "Hasta",
      }).paksha,
    ).toBe("krishna");
  });
  it("drops paksha when the column and the tithi text disagree", () => {
    const n = normalisePanchangam({
      tithi: "Shukla Chaturthi",
      paksha: "Krishna",
      nakshatra: "Hasta",
    });
    expect(n.paksha).toBeNull();
    expect(n.tithi).toBe("chaturthi");
  });
  it("implies paksha for Purnima and Amavasya", () => {
    expect(
      normalisePanchangam({ tithi: "Pournami", paksha: null, nakshatra: "x" })
        .paksha,
    ).toBe("shukla");
    expect(
      normalisePanchangam({ tithi: "Amavasya", paksha: "", nakshatra: "x" })
        .paksha,
    ).toBe("krishna");
  });
  it("treats a self-contradicting row (Purnima marked Krishna) as unknown", () => {
    const n = normalisePanchangam({
      tithi: "Purnima",
      paksha: "Krishna",
      nakshatra: "Hasta",
    });
    expect(n.tithi).toBeNull();
    expect(n.paksha).toBeNull();
    expect(n.nakshatra).toBe("hasta");
  });
});

describe("rule evaluation", () => {
  const day = (t: any) => normalisePanchangam(t);
  const trayodashiShukla = day({
    tithi: "Trayodashi",
    paksha: "Shukla",
    nakshatra: "Rohini",
  });

  it("matches a single-tithi rule in either paksha", () => {
    const rule = { tithis: ["trayodashi"], paksha: null, nakshatras: null };
    expect(evaluateRule(rule, trayodashiShukla)).toBe("match");
    expect(
      evaluateRule(
        rule,
        day({ tithi: "Trayodashi", paksha: "Krishna", nakshatra: "Hasta" }),
      ),
    ).toBe("match");
    expect(
      evaluateRule(
        rule,
        day({ tithi: "Dwadashi", paksha: "Shukla", nakshatra: "Rohini" }),
      ),
    ).toBe("no_match");
  });
  it("supports a set of tithis (OR within the set)", () => {
    const rule = {
      tithis: ["panchami", "ashtami", "chaturdashi", "amavasya", "purnima"],
      paksha: null,
      nakshatras: null,
    };
    for (const t of [
      "Panchami",
      "Ashtami",
      "Chaturdasi",
      "Amavasai",
      "Pournami",
    ]) {
      expect(
        evaluateRule(rule, day({ tithi: t, paksha: null, nakshatra: "Hasta" })),
      ).toBe("match");
    }
    expect(
      evaluateRule(
        rule,
        day({ tithi: "Navami", paksha: "Shukla", nakshatra: "Hasta" }),
      ),
    ).toBe("no_match");
  });
  it("combines tithi and paksha (AND)", () => {
    const sankata = {
      tithis: ["chaturthi"],
      paksha: "krishna" as const,
      nakshatras: null,
    };
    expect(
      evaluateRule(
        sankata,
        day({ tithi: "Chaturthi", paksha: "Krishna", nakshatra: "Hasta" }),
      ),
    ).toBe("match");
    expect(
      evaluateRule(
        sankata,
        day({ tithi: "Chaturthi", paksha: "Shukla", nakshatra: "Hasta" }),
      ),
    ).toBe("no_match");
  });
  it("combines tithi, paksha and nakshatra", () => {
    const rule = {
      tithis: ["ashtami"],
      paksha: "krishna" as const,
      nakshatras: ["rohini"],
    };
    expect(
      evaluateRule(
        rule,
        day({ tithi: "Ashtami", paksha: "Krishna", nakshatra: "Rohini" }),
      ),
    ).toBe("match");
    expect(
      evaluateRule(
        rule,
        day({ tithi: "Ashtami", paksha: "Krishna", nakshatra: "Hasta" }),
      ),
    ).toBe("no_match");
  });
  it("is unknown (not a match) when a needed value is missing", () => {
    const sankata = {
      tithis: ["chaturthi"],
      paksha: "krishna" as const,
      nakshatras: null,
    };
    expect(
      evaluateRule(
        sankata,
        day({ tithi: "Chaturthi", paksha: null, nakshatra: "Hasta" }),
      ),
    ).toBe("unknown");
    const nak = { tithis: null, paksha: null, nakshatras: ["krittika"] };
    expect(
      evaluateRule(
        nak,
        day({
          tithi: "Panchami",
          paksha: "Shukla",
          nakshatra: "Ardra / Punarvasu",
        }),
      ),
    ).toBe("unknown");
  });
  it("a definite mismatch wins over an unknown (cannot match anyway)", () => {
    const rule = {
      tithis: ["chaturthi"],
      paksha: "krishna" as const,
      nakshatras: null,
    };
    expect(
      evaluateRule(
        rule,
        day({ tithi: "Panchami", paksha: null, nakshatra: "Hasta" }),
      ),
    ).toBe("no_match");
  });
  it("evaluateRules ORs the rules of a pooja", () => {
    const rules = [
      { tithis: ["amavasya"], paksha: null, nakshatras: null },
      { tithis: null, paksha: null, nakshatras: ["krittika"] },
    ];
    expect(
      evaluateRules(
        rules,
        day({ tithi: "Panchami", paksha: "Shukla", nakshatra: "Karthigai" }),
      ),
    ).toBe("match");
    expect(
      evaluateRules(
        rules,
        day({ tithi: "Panchami", paksha: "Shukla", nakshatra: "Rohini" }),
      ),
    ).toBe("no_match");
    expect(
      evaluateRules(
        rules,
        day({ tithi: "Panchami", paksha: "Shukla", nakshatra: "" }),
      ),
    ).toBe("unknown");
    expect(evaluateRules([], trayodashiShukla)).toBe("no_match");
  });
});
