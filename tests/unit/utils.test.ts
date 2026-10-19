import { describe, expect, it } from "vitest";
import { formatBytes, formatSpeed } from "@/lib/utils/format-bytes";
import { formatCountdown, formatDuration } from "@/lib/utils/format-duration";
import { generateSessionCode, isValidSessionCode, normalizeCodeInput } from "@/lib/utils/generate-session-code";
import { randomInt, randomToken } from "@/lib/utils/random";
import { ProgressMeter } from "@/lib/transfer/progress-meter";
import { deviceLabelFromUserAgent } from "@/lib/server/device-label";
import { routeFromStats } from "@/lib/webrtc/ice-configuration";

describe("formatBytes", () => {
  it("formats binary units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 ** 3)).toBe("5.0 GB");
    expect(formatBytes(150 * 1024 ** 2)).toBe("150 MB");
  });
  it("rejects invalid input", () => {
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatSpeed(0)).toBe("—");
    expect(formatSpeed(2048)).toBe("2.0 KB/s");
  });
});

describe("formatDuration", () => {
  it("formats seconds, minutes and hours", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(42)).toBe("42s");
    expect(formatDuration(200)).toBe("3m 20s");
    expect(formatDuration(3900)).toBe("1h 05m");
    expect(formatCountdown(61_000)).toBe("1:01");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});

describe("session codes", () => {
  it("are always five digits", () => {
    for (let i = 0; i < 2000; i += 1) {
      const code = generateSessionCode();
      expect(code).toMatch(/^\d{5}$/);
      expect(isValidSessionCode(code)).toBe(true);
    }
  });
  it("validates and normalizes input", () => {
    expect(isValidSessionCode("1234")).toBe(false);
    expect(isValidSessionCode("123456")).toBe(false);
    expect(isValidSessionCode("12a45")).toBe(false);
    expect(isValidSessionCode(12345)).toBe(false);
    expect(normalizeCodeInput(" 12-34 5678")).toBe("12345");
  });
  it("randomInt stays in range and tokens are unique", () => {
    for (let i = 0; i < 1000; i += 1) {
      const value = randomInt(7);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(7);
    }
    expect(() => randomInt(0)).toThrow();
    const tokens = new Set(Array.from({ length: 200 }, () => randomToken()));
    expect(tokens.size).toBe(200);
    expect([...tokens][0]).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("ProgressMeter", () => {
  it("computes speed and ETA from real samples", () => {
    const meter = new ProgressMeter(4000, 1000);
    meter.record(0, 0);
    expect(meter.etaSeconds(1000, 500)).toBeNull();
    meter.record(1_000_000, 1000);
    meter.record(2_000_000, 2000);
    expect(meter.bytesPerSecond(2000)).toBeCloseTo(1_000_000, -3);
    expect(meter.etaSeconds(10_000_000, 2000)).toBeCloseTo(8, 0);
  });
  it("reports slowing down during a stall", () => {
    const meter = new ProgressMeter(4000, 0);
    meter.record(0, 0);
    meter.record(1_000_000, 1000);
    expect(meter.bytesPerSecond(4000)).toBeLessThan(meter.bytesPerSecond(1000));
  });
});

describe("deviceLabelFromUserAgent", () => {
  it("produces a coarse label", () => {
    expect(
      deviceLabelFromUserAgent(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
      ),
    ).toBe("Chrome on Android");
    expect(
      deviceLabelFromUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari on iPhone");
    expect(deviceLabelFromUserAgent(null)).toBe("Browser");
  });
});

describe("routeFromStats", () => {
  const makeStats = (reports: Record<string, unknown>[]) => {
    const map = new Map(reports.map((report) => [report.id as string, report]));
    return { forEach: (cb: (r: Record<string, unknown>) => void) => map.forEach(cb), get: (id: string) => map.get(id) };
  };
  it("detects relayed and direct pairs", () => {
    const relay = makeStats([
      { id: "t", type: "transport", selectedCandidatePairId: "p" },
      { id: "p", type: "candidate-pair", localCandidateId: "l", remoteCandidateId: "r" },
      { id: "l", type: "local-candidate", candidateType: "relay" },
      { id: "r", type: "remote-candidate", candidateType: "srflx" },
    ]);
    expect(routeFromStats(relay)).toBe("relay");
    const direct = makeStats([
      { id: "p", type: "candidate-pair", selected: true, localCandidateId: "l", remoteCandidateId: "r" },
      { id: "l", type: "local-candidate", candidateType: "host" },
      { id: "r", type: "remote-candidate", candidateType: "host" },
    ]);
    expect(routeFromStats(direct)).toBe("direct");
    expect(routeFromStats(makeStats([]))).toBe("unknown");
  });
});
