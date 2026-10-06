# Handoff: Google Postmaster v2

Finish this. Do not re-research the API. Do not open a second cog.

## Where the work is

Local source, not a git repo yet:

`/Users/m.h.lines/stackmoxie/cog-googleapis`

Seeded from the live image `stackmoxie/googleapis:dev-v122` (commit `bb77d360` that CircleCI cloned from `run-crank/cog-googleapis`). `run-crank/cog-googleapis` is not reachable. The new home is **`Stack-Moxie/cog-googleapis`**, same move as `Stack-Moxie/cog-hubspot`.

Branch the user named: **`google-postmaster-2026`**.

Cog id stays **`stackmoxie/googleapis`**. It is already in `cog-mechanism/src/constants/stackmoxie-named-cogs.ts`. Do not add a second name.

## Product rules (already decided)

Passed = nothing needs the marketer's attention. That includes a healthy value **and** Google publishing no data or no compliance verdict. The message must say which one happened.

Failed = Google reported a value that misses the check. Lead with the meaning, then why it matters, what was checked, and what to look at. Put the shared assertion under a `Technical detail:` line.

Error = Stack Moxie could not run the check (expired auth, old scope, denied request, bad domain, API failure). Tell them to reconnect Google APIs. No data is not an error.

Form and sentences use percentages (`0.10%`), the word Metric, and the domain exactly as typed (`www.stackmoxie.com` is not `stackmoxie.com`). `0.10` and `0.10%` both mean 0.10 percent. Compare the ratio internally.

Latest day with data is the default. Name the date Google actually had and how old it is. Age does not fail the check. At 7 days or older, add: Google's latest available data is N days old. This result may not reflect current sending.

The period check is Google's value for those dates. Do not call it an average. Do not append it to the daily result.

Do not rename `TrafficStatsFieldEquals` or `TrafficStatsRollingAverage`. They stay on the v1 API.

## Steps already written

| Class | Sentence shape |
| --- | --- |
| `SenderRequirementsEquals` | the Google Postmaster sender requirements for {domain} should be compliant |
| `PostmasterMetricEquals` | the Google Postmaster {metric} for {domain} should be below 0.10% on the latest day with data |
| `PostmasterMetricPeriodEquals` | the Google Postmaster {metric} for {domain} from {from} to {to} should be below 0.10% |

Metrics in `src/client/postmaster-v2.ts`: spam rate, SPF / DKIM / DMARC authentication success, inbound TLS rate, outbound TLS rate, delivery error rate. Feedback-loop spam rate is not in this slice. The API requires a feedback-loop id.

HTTP for v2 is `PostmasterV2Mixin` via `oauth2Client.request`. v1 still uses the `googleapis` SDK. `CachingClientWrapper` forwards the two new methods.

Tests are in `test/steps/postmaster/`. They stub the client. No live Google calls.

## Finish line

1. From `cog-googleapis`: `npm test` and `npm run lint`. Fix failures in the step or the test. Do not skip tests. `node_modules` is already installed.
2. `git init -b google-postmaster-2026`. Commit the source. Do not commit `node_modules`.
3. Create public GitHub repo `Stack-Moxie/cog-googleapis` (HubSpot's cog repo is public) and push `google-postmaster-2026`.
4. Stop. Do not `docker push`. CircleCI context `docker-creds-to-publish-cogs` publishes `dev-vN` from `main` only. This branch should lint and test.

## Do not do yet

- Do not bump `dev-v122` in MonoRepo. The pin changes only after CircleCI has published the new tag.
- Do not hand-edit `app/cog-registry.js`.
- Do not point `app/api/starters/postmaster-checklist.js` at the new steps until the new image is what runs. The live starter still checks `domainReputation` and `userReportedSpamRatio`.
- Do not change `sails_custom__oauth__google__scope` yet. It is `https://www.googleapis.com/auth/postmaster.readonly`. v2 reads need `https://www.googleapis.com/auth/postmaster.traffic.readonly`. Changing it forces every customer to reconnect and can break the v1 steps still in production.

After the image exists, the app work is: request the v2 scope on the existing `googleapis` hook, shine the three new steps, and replace the starter tiles with **Gmail sender requirements** and **Spam complaints** using the sentences above. Registry rebuild is `npm run build-cog-registry` from `cog-mechanism/` once the container is pullable.

UX review the copy was written against: MonoRepo canvas `postmaster-v2-ux.canvas.tsx`.
