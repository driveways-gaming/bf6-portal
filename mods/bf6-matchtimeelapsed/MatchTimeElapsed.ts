const TIME_LIMIT = 60;
const RESET_TIME = 10;
function getServerTime() {
    return tick * (1 / 30);
}

function T(value: number) {
    const intPart = Math.floor(value).toString().padStart(4, '0');
    const decPart = (value % 1).toFixed(3).substring(2);
    return `${intPart}.${decPart}`;
}

function Log(msg: string) {
    const elapsed = mod.GetMatchTimeElapsed();
    const remaining = mod.GetMatchTimeRemaining();
    const roundTime = mod.GetRoundTime();
    const serverTime = getServerTime();
    console.log(`[${T(serverTime)}][${T(elapsed)}][${T(remaining)}][${T(roundTime)}][${State[state]}] ${msg}`);
}
export function OnGameModeStarted() {
    Log("OnGameModeStarted { SetGameModeTimeLimit() }");

    mod.SetGameModeTimeLimit(TIME_LIMIT);
    SetState(State.WaitingForStart);
}
export function OnGameModeEnding() {
    Log("OnGameModeEnding");
}
let tick = 0;
enum State {
    Loaded = 0,
    OnGoing = 1,
    Started = 2,
    Resetting = 3,
    WaitingForStart = 4,
    WaitingForTimeToStartAfterReset = 5,
}
let state = State.Loaded;
let resetTime = 0;
export function OngoingGlobal() {
    const now = mod.GetMatchTimeElapsed();
    tick++;
    switch (state) {
        case State.WaitingForStart:
            if (now > 0 && now < RESET_TIME) {
                Log("Time Started");
                SetState(State.Started);
            }
            break;
        case State.Started:
            if (now > RESET_TIME) {
                Log("Resetting time");
                mod.ResetGameModeTime();
                SetState(State.Resetting);
                resetTime = getServerTime();
            }
            break;
        case State.Resetting:
            if (now === 0) {
                Log("Unpausing time");
                mod.PauseGameModeTime(false);
                SetState(State.WaitingForTimeToStartAfterReset);
            }
            break;
        case State.WaitingForTimeToStartAfterReset:
            if (now > 0 && now < RESET_TIME) {
                Log("Time Started after reset");
                SetState(State.OnGoing);
            }
            break;
        default:
            break;
    }
}
let lastStateTransitionTime = 0;
function SetState(newState: State) {
    const now = getServerTime();
    const timeSinceLastStateTransition = now - lastStateTransitionTime;
    lastStateTransitionTime = now;
    Log("Setting state to " + State[newState] + " after " + timeSinceLastStateTransition + " seconds");
    state = newState;
}
export function OnPlayerJoinGame(player: mod.Player) {
    Log("Player joined: " + mod.GetObjId(player));
}
export function OnPlayerDeployed(player: mod.Player) {
    Log("Player deployed: " + mod.GetObjId(player));
}
export function OnTimeLimitReached() {
    Log("Time limit reached");
    mod.EndGameMode(mod.GetTeam(1));
}
console.log("[serverTime][elapsed][remaining][roundTime]");
Log("Script loaded.");
