use super::cursors::cursor_key;
use super::{
    TRACKED_MODULES, WORLD_GATE_EXTENSION_EVENTS, WORLD_GATE_JUMP_EVENTS,
    WORLD_GATE_TOPOLOGY_EVENTS,
};

#[test]
fn tracks_operational_protocol_modules() {
    assert!(TRACKED_MODULES.contains(&"fraud_challenge"));
    assert!(TRACKED_MODULES.contains(&"reputation_gate"));
}

#[test]
fn module_cursor_keys_are_package_scoped() {
    let old_key = cursor_key("0xold", "reputation_gate");
    let new_key = cursor_key("0xnew", "reputation_gate");

    assert_eq!(old_key, "cursor:0xold:reputation_gate");
    assert_ne!(old_key, new_key);
}

#[test]
fn jump_events_list_contains_jump_event() {
    assert!(WORLD_GATE_JUMP_EVENTS.contains(&"JumpEvent"));
}

#[test]
fn topology_and_jump_event_sets_are_disjoint() {
    for event in WORLD_GATE_JUMP_EVENTS {
        assert!(
            !WORLD_GATE_TOPOLOGY_EVENTS.contains(event),
            "event '{event}' must not appear in both topology and jump event lists"
        );
    }
}

#[test]
fn world_event_type_never_contains_placeholder() {
    let pkg = "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c";
    for event in WORLD_GATE_EXTENSION_EVENTS
        .iter()
        .chain(WORLD_GATE_TOPOLOGY_EVENTS)
        .chain(WORLD_GATE_JUMP_EVENTS)
    {
        let event_type = format!("{pkg}::gate::{event}");
        assert!(
            !event_type.contains("PLACEHOLDER"),
            "event type contains PLACEHOLDER: {event_type}"
        );
    }
}

#[test]
fn world_event_cursor_key_exceeds_old_varchar64_limit() {
    let pkg = "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c";
    let event_type = format!("{pkg}::gate::ExtensionAuthorizedEvent");
    let key = format!("cursor:world:{event_type}");
    assert!(
        key.len() > 64,
        "expected cursor key > 64 chars, got {} chars: {key}",
        key.len()
    );
}
