import { MATCH } from '../constants.js';

export class Match {
  constructor(overs = MATCH.oversPerInnings) {
    this.oversPerInnings = overs;   // chosen on the start screen (5/10/20/custom)
    this.reset();
  }

  // overs for THIS innings; reset() never touches it (set once per game)
  setOvers(n) {
    const v = Math.max(1, Math.min(50, Math.round(Number(n) || MATCH.oversPerInnings)));
    this.oversPerInnings = v;
  }

  reset() {
    this.runs = 0;
    this.wickets = 0;
    this.balls = 0;                   // LEGAL balls bowled (wides don't count)
    this.wides = 0;                   // wides conceded (each worth 1 extra)
    this.holders = [];                // per-ball markers for the reel
    this.over = false;
    this.resultText = '';
  }

  get totalBalls() { return this.oversPerInnings * MATCH.ballsPerOver; }
  get ballsRemaining() { return this.totalBalls - this.balls; }
  get isOver() { return this.over; }

  // Wide: +1 extra, does NOT count as a ball (basic cricket — extra ball to be bowled).
  // Never carries a wicket in this game.
  recordWide(runs = 1) {
    if (this.over) return;
    this.runs += runs;
    this.wides += runs;
    this.holders.push({ marker: 'Wd', kind: 'wide' });
  }

  // record a completed LEGAL delivery. kind: 'dot'|'run'|'four'|'six'|'wicket'
  recordBall(kind, runs = 0) {
    if (this.over) return;
    this.balls += 1;
    let marker = kind === 'dot' ? '·' : kind === 'wicket' ? 'W' : String(runs);
    if (kind === 'four') marker = '4';
    if (kind === 'six') marker = '6';
    this.holders.push({ marker, kind });
    if (kind === 'wicket') this.wickets += 1;
    else this.runs += runs;

    if (this.wickets >= MATCH.wickets || this.balls >= this.totalBalls) {
      this.over = true;
      this.resultText =
        this.wickets >= MATCH.wickets
          ? `ALL OUT — ${this.runs} runs`
          : `${this.runs}/${this.wickets} off ${this.oversPerInnings} overs`;
    }
  }

  oversText() {
    const whole = Math.floor(this.balls / MATCH.ballsPerOver);
    const part = this.balls % MATCH.ballsPerOver;
    return `${whole}.${part}/${this.oversPerInnings}`;
  }

  scoreText() { return `${this.runs}/${this.wickets}`; }

  lastSixMarkers() { return this.holders.slice(-6); }
}
