import { Suspense } from "react";
import { GardenViews } from "./garden-views";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <h1>The Garden Within</h1>
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <GardenViews />
      </Suspense>
    </main>
  );
}
