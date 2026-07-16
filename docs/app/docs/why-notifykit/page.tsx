import Link from "next/link";
import { createDocsMetadata } from "../../../lib/site";

export const metadata = createDocsMetadata("why-notifykit");

export default function WhyNotifyKitPage() {
  return (
    <article>
      <h1>Why NotifyKit?</h1>
      <p>
        Notification infrastructure already exists. NotifyKit is useful because
        it chooses a different boundary: it is a library inside your TypeScript
        application, not a second application that owns your workflows and
        notification state.
      </p>

      <div className="callout callout-tip">
        <strong>The short version:</strong> use NotifyKit when notification
        behavior belongs to engineering, should change in the same pull request
        as product behavior, and should persist in the same database as the app.
      </div>

      <h2>The specific problem</h2>
      <p>
        A basic notification starts as an email or inbox row. It quickly grows
        preferences, unsubscribe rules, retries, deduplication, quiet hours,
        realtime unread state, and debugging. Rebuilding those pieces per
        feature is error-prone, but adopting a notification platform can add a
        remote control plane, another data store, environment synchronization,
        and a second deployment model.
      </p>
      <p>
        NotifyKit packages the reusable pipeline while leaving definitions,
        authentication, data, and deployment inside the application.
      </p>

      <h2>Choose by operating model</h2>
      <table>
        <thead>
          <tr><th></th><th>NotifyKit</th><th>Managed platform</th><th>Self-hosted platform</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>Runtime</strong></td><td>Your app or worker</td><td>Vendor service</td><td>Separate services you operate</td></tr>
          <tr><td><strong>Definitions</strong></td><td>Imported TypeScript</td><td>Dashboard/API/synced files</td><td>Dashboard or code-first workflows</td></tr>
          <tr><td><strong>State</strong></td><td>Your app database</td><td>Vendor-managed</td><td>Platform database</td></tr>
          <tr><td><strong>Visual editor</strong></td><td>No</td><td>Usually</td><td>Usually</td></tr>
          <tr><td><strong>Durable delivery</strong></td><td>You connect the queue/worker</td><td>Managed</td><td>You operate platform workers</td></tr>
          <tr><td><strong>Channel catalog</strong></td><td>Focused; adapters are extensible</td><td>Broad</td><td>Broad</td></tr>
          <tr><td><strong>Primary user</strong></td><td>Application engineers</td><td>Engineering + product/growth</td><td>Platform teams</td></tr>
        </tbody>
      </table>

      <h2>Good fit</h2>
      <ul>
        <li>A TypeScript monolith, modular monolith, or small service.</li>
        <li>Transactional product notifications rather than marketing campaigns.</li>
        <li>Teams that already operate Postgres or SQLite and want app-owned data.</li>
        <li>Notifications that should be reviewed, tested, and deployed with code.</li>
        <li>Teams willing to own queueing and provider operations in exchange for control.</li>
      </ul>

      <h2>Not a good fit</h2>
      <ul>
        <li>Non-engineers need to design and publish workflows without a deploy.</li>
        <li>You need dozens of turnkey providers, mobile push SDKs, or marketing broadcasts today.</li>
        <li>You want managed deliverability, analytics, and support rather than infrastructure ownership.</li>
        <li>You need a visual journey builder with branching multi-step campaigns.</li>
        <li>You cannot operate a durable worker for delivery that must survive crashes.</li>
      </ul>

      <h2>Alternatives are valid</h2>
      <p>
        <a href="https://docs.knock.app/" target="_blank" rel="noreferrer">Knock</a>,{" "}
        <a href="https://www.courier.com/docs/" target="_blank" rel="noreferrer">Courier</a>, and{" "}
        <a href="https://docs.suprsend.com/" target="_blank" rel="noreferrer">SuprSend</a>{" "}
        are strong choices when a managed control plane is an advantage. Novu
        offers both cloud and{" "}
        <a href="https://docs.novu.co/community/self-hosting-novu/overview" target="_blank" rel="noreferrer">self-hosted</a>{" "}
        platform models, including code-first workflows. NotifyKit is not
        claiming those tools lack type safety or source control; its distinction
        is that no notification platform is required at runtime.
      </p>

      <div className="button-row">
        <Link href="/docs/production-readiness" className="primary">Read the production boundary</Link>
        <Link href="/docs/quickstart">Try the quickstart</Link>
        <Link href="/demo">Open the demo</Link>
      </div>

      <div className="page-nav">
        <Link href="/docs">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Overview</span>
        </Link>
        <Link href="/docs/installation">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Installation</span>
        </Link>
      </div>
    </article>
  );
}
