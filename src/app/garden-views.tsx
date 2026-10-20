import type { SVGProps } from "react";
import { connection } from "next/server";
import { datasetKind } from "@/lib/dataset";
import { localToday } from "@/lib/dates";
import {
  barTotal,
  blossomsByStatus,
  cellTitle,
  dayCells,
  monthBars,
  TONE_COLORS,
  weekColumns,
  type DayCell,
  type MonthBar,
  type Segment,
  type StatusColumn,
} from "@/lib/garden";
import { gardenRows } from "@/lib/garden-data";
import { ENERGY_TONES, ROOT_TONES } from "@/lib/router";
import styles from "./page.module.css";

const EMPTY = <p className={styles.muted}>Nothing to show yet.</p>;

const toneFill = (tone: string) => ({ fill: `var(${TONE_COLORS[tone]})` });

// Root tones reuse the Seed hues, so Roots also get a 45° hatch to tell them apart.
const ROOT_HATCH = "root-hatch";

function HatchDefs() {
  return (
    <svg width={0} height={0} aria-hidden="true" style={{ position: "absolute" }}>
      <defs>
        <pattern id={ROOT_HATCH} width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={4} style={{ stroke: "var(--background)", strokeWidth: 1.5, strokeOpacity: 0.6 }} />
        </pattern>
      </defs>
    </svg>
  );
}

function ToneRect({ tone, ...rect }: SVGProps<SVGRectElement> & { tone: string }) {
  return (
    <>
      <rect {...rect} style={toneFill(tone)} />
      {ROOT_TONES.includes(tone) && <rect {...rect} fill={`url(#${ROOT_HATCH})`} />}
    </>
  );
}

// Reads Postgres and the date at request time, so it renders behind Suspense.
export async function GardenViews() {
  await connection();
  const today = localToday();
  const [kind, { entries, blossoms }] = await Promise.all([datasetKind(), gardenRows(today)]);
  const cells = dayCells(entries, today);
  const months = monthBars(entries, today);
  const columns = blossomsByStatus(blossoms);

  return (
    <>
      <HatchDefs />
      {kind === "sample" && (
        <p className={styles.notice}>This page is showing made-up sample data, not a real journal.</p>
      )}

      <section className={styles.section}>
        <h2>A year of Energy Tones</h2>
        <p className={styles.muted}>Daily Seeds, the last 365 days ending today.</p>
        {cells.some((c) => c.tones.length > 0) ? <YearGrid cells={cells} /> : EMPTY}
      </section>

      <section className={styles.section}>
        <h2>Month by month</h2>
        <p className={styles.muted}>
          How many Seeds and Roots had each tone. Seeds and Roots each have their own scale.
        </p>
        {months.some((m) => m.seeds.length > 0 || m.roots.length > 0) ? <MonthBars months={months} /> : EMPTY}
      </section>

      <Legend />

      <section className={styles.section}>
        <h2>Blossoms by Status</h2>
        {blossoms.length > 0 ? <StatusColumns columns={columns} /> : EMPTY}
      </section>
    </>
  );
}

const CELL = 11;
const STEP = CELL + 2;
const GRID_LEFT = 30;
const GRID_TOP = 16;
const WEEKDAYS = ["Mon", "", "Wed", "", "Fri", "", ""];

function YearGrid({ cells }: { cells: DayCell[] }) {
  const columns = weekColumns(cells);
  const width = GRID_LEFT + columns.length * STEP;
  const height = GRID_TOP + 7 * STEP;
  return (
    <div className={styles.scroll}>
      <svg width={width} height={height} role="img" aria-label="Energy Tones for each day of the last year">
        {WEEKDAYS.map((label, row) =>
          label ? (
            <text key={row} x={0} y={GRID_TOP + row * STEP + CELL - 1} className={styles.axis}>
              {label}
            </text>
          ) : null,
        )}
        {columns.map((column, col) => {
          const x = GRID_LEFT + col * STEP;
          // A month's label sits over the week its first day falls in.
          const first = column.find((cell) => cell?.date.endsWith("-01"));
          return (
            <g key={col}>
              {first && col > 0 && (
                <text x={x} y={GRID_TOP - 5} className={styles.axis}>
                  {new Date(`${first.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}
                </text>
              )}
              {column.map((cell, row) => (cell ? <Day key={cell.date} cell={cell} x={x} y={GRID_TOP + row * STEP} /> : null))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// A day with several tones is split into equal stripes, top to bottom.
function Day({ cell, x, y }: { cell: DayCell; x: number; y: number }) {
  const stripe = CELL / cell.tones.length;
  return (
    <g>
      <title>{cellTitle(cell)}</title>
      {cell.tones.length === 0 ? (
        <rect x={x} y={y} width={CELL} height={CELL} rx={2} className={styles.emptyCell} />
      ) : cell.tones.length === 1 ? (
        <rect x={x} y={y} width={CELL} height={CELL} rx={2} style={toneFill(cell.tones[0])} />
      ) : (
        cell.tones.map((tone, i) => (
          <rect key={tone} x={x} y={y + i * stripe} width={CELL} height={stripe} style={toneFill(tone)} />
        ))
      )}
    </g>
  );
}

const BAR = 18;
const MONTH_STEP = 34;
const BARS_LEFT = 48;
const CHART_HEIGHT = 90;
const CHART_GAP = 22;

function MonthBars({ months }: { months: MonthBar[] }) {
  const series = [
    { name: "Seeds", pick: (m: MonthBar) => m.seeds },
    { name: "Roots", pick: (m: MonthBar) => m.roots },
  ];
  const width = BARS_LEFT + months.length * MONTH_STEP;
  const height = series.length * (CHART_HEIGHT + CHART_GAP) + 18;
  return (
    <div className={styles.scroll}>
      <svg width={width} height={height} role="img" aria-label="Tone counts for each month, Seeds and Roots">
        {series.map(({ name, pick }, s) => {
          const top = s * (CHART_HEIGHT + CHART_GAP) + 12;
          const base = top + CHART_HEIGHT;
          const max = Math.max(1, ...months.map((m) => barTotal(pick(m))));
          return (
            <g key={name}>
              <text x={0} y={top + 10} className={styles.seriesLabel}>
                {name}
              </text>
              <text x={0} y={top + 24} className={styles.axis}>
                max {max}
              </text>
              <line x1={BARS_LEFT} x2={width} y1={base} y2={base} className={styles.baseline} />
              {months.map((m, i) => (
                <Bar
                  key={m.month}
                  segments={pick(m)}
                  title={`${m.label} ${name}`}
                  x={BARS_LEFT + i * MONTH_STEP + (MONTH_STEP - BAR) / 2}
                  base={base}
                  scale={CHART_HEIGHT / max}
                />
              ))}
            </g>
          );
        })}
        {months.map((m, i) => (
          <text
            key={m.month}
            x={BARS_LEFT + i * MONTH_STEP + MONTH_STEP / 2}
            y={height - 4}
            textAnchor="middle"
            className={styles.axis}
          >
            {i === 0 || m.month.endsWith("-01") ? m.label.replace(" 20", " ’") : m.label.slice(0, 3)}
          </text>
        ))}
      </svg>
    </div>
  );
}

function Bar({ segments, title, x, base, scale }: { segments: Segment[]; title: string; x: number; base: number; scale: number }) {
  const counts = segments.map((s) => `${s.tone} ${s.count}`).join(", ") || "none";
  return (
    <g>
      <title>{`${title}: ${counts}`}</title>
      {/* An invisible full-height target, so empty and short bars still have a tooltip. */}
      <rect x={x} y={base - CHART_HEIGHT} width={BAR} height={CHART_HEIGHT} fill="transparent" />
      {segments.map((seg) => (
        <ToneRect
          key={seg.tone}
          tone={seg.tone}
          x={x}
          y={base - (seg.start + seg.count) * scale}
          width={BAR}
          height={seg.count * scale}
          className={styles.segment}
        />
      ))}
    </g>
  );
}

function Legend() {
  const groups = [
    { name: "Energy Tone (Seeds)", tones: ENERGY_TONES },
    { name: "Tone / Feeling (Roots)", tones: ROOT_TONES },
  ];
  return (
    <section className={styles.legend} aria-label="Tone colors">
      {groups.map((group) => (
        <div key={group.name}>
          <h3>{group.name}</h3>
          <ul>
            {group.tones.map((tone) => (
              <li key={tone}>
                <svg width={12} height={12} aria-hidden="true">
                  <ToneRect tone={tone} width={12} height={12} rx={2} />
                </svg>
                {tone}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function StatusColumns({ columns }: { columns: StatusColumn[] }) {
  return (
    <div className={styles.columns}>
      {columns.map((column) => (
        <div key={column.status} className={styles.column}>
          <h3>
            {column.status} <span className={styles.muted}>{column.blossoms.length}</span>
          </h3>
          {column.blossoms.length > 0 ? (
            <ul>
              {column.blossoms.map((b) => (
                <li key={b.url}>
                  <a href={b.url} target="_blank" rel="noopener noreferrer">
                    {b.title || "Untitled"}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>None</p>
          )}
        </div>
      ))}
    </div>
  );
}
