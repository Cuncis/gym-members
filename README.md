## Classes and bookings

Classes are weekly templates ("Saturday 18:30"). Sessions are real, dated copies of a class, created
8 weeks ahead from the class page. Members book sessions on the Schedule page.

### Rules

- All moments are stored in UTC. Pages show them in the gym's time zone (`Gym.timeZone`).
- A member has at most one booking row per session (unique on instance + user).
- A full session can take a waitlist. Cancelling a booked spot gives it to the first person waiting,
  in the same database transaction, so nobody can sneak in between.
- Booking and cancelling lock the session's row (`SELECT ... FOR UPDATE`), so two people cannot take the last spot.
- Cancelled bookings are kept (status CANCELLED), not deleted.

### Who can do what

| Action | ADMIN | MANAGER | TRAINER | MEMBER |
| --- | --- | --- | --- | --- |
| Create a class | yes | yes | yes (own) | no |
| Generate sessions | yes | yes | own classes | no |
| Book and cancel own bookings | yes | yes | yes | yes |
| Cancel anyone's booking | yes | yes | no | no |
| See the bookings table | all | all | own classes | no |

### Calendar feed

Each member can create a private link at `/api/calendar/<token>/calendar.ics`. It lists their booked
and waitlisted sessions. The link is the only credential, so it can be replaced or turned off from the Schedule page.

### Scripts

| Command | What it does |
| --- | --- |
| `pnpm test` | Unit tests (time zones, permissions, calendar format, tokens) |
| `pnpm test:concurrency` | 20 people book 5 spots at once; fails if overbooked |
| `pnpm test:waitlist` | Walks through the waitlist, including simultaneous cancels |
| `pnpm seed:bookings` | Fills upcoming sessions with realistic bookings |

### Known limits

- Raising a session's capacity does not promote anyone from the waitlist.
- Promoted members are not notified yet (email arrives in Project 7).
- Staff cannot book on behalf of a member.
- The schedule refreshes every 30 seconds, not instantly.