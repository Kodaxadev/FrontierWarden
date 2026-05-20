use anyhow::Result;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use crate::event_source::SuiEventSource;
use crate::rpc::{EventId, EventPage, SuiEvent};
use crate::shadow_event_source::ShadowEventSource;

/// A fake event source that counts calls and returns a fixed page.
struct FakeSource {
    call_count: Arc<AtomicUsize>,
    events: Vec<SuiEvent>,
    should_fail: bool,
}

impl FakeSource {
    fn new(events: Vec<SuiEvent>) -> Self {
        Self {
            call_count: Arc::new(AtomicUsize::new(0)),
            events,
            should_fail: false,
        }
    }

    fn failing() -> Self {
        Self {
            call_count: Arc::new(AtomicUsize::new(0)),
            events: vec![],
            should_fail: true,
        }
    }

    fn count(&self) -> Arc<AtomicUsize> {
        Arc::clone(&self.call_count)
    }
}

impl SuiEventSource for FakeSource {
    async fn query_events(
        &self,
        _package_id: &str,
        _module: &str,
        _cursor: Option<&EventId>,
        _limit: u32,
    ) -> Result<EventPage> {
        self.call_count.fetch_add(1, Ordering::SeqCst);
        if self.should_fail {
            anyhow::bail!("fake source error");
        }
        Ok(EventPage {
            data: self.events.clone(),
            next_cursor: None,
            has_next_page: false,
        })
    }

    async fn query_events_by_type(
        &self,
        _event_type: &str,
        _cursor: Option<&EventId>,
        _limit: u32,
    ) -> Result<EventPage> {
        self.call_count.fetch_add(1, Ordering::SeqCst);
        if self.should_fail {
            anyhow::bail!("fake source error");
        }
        Ok(EventPage {
            data: self.events.clone(),
            next_cursor: None,
            has_next_page: false,
        })
    }
}

fn make_event(tx: &str, module: &str) -> SuiEvent {
    SuiEvent {
        id: EventId {
            tx_digest: tx.into(),
            event_seq: "0".into(),
        },
        package_id: "0xpkg".into(),
        transaction_module: module.into(),
        sender: None,
        type_: format!("0xpkg::{module}::Event"),
        parsed_json: serde_json::json!({}),
        timestamp_ms: None,
        checkpoint: Some("100".into()),
    }
}

#[tokio::test]
async fn shadow_returns_primary_result() {
    let primary = FakeSource::new(vec![make_event("Tx1", "attestation")]);
    let shadow = FakeSource::new(vec![]);
    let source = ShadowEventSource::new(primary, shadow);

    let page = source
        .query_events("0xpkg", "attestation", None, 10)
        .await
        .unwrap();

    assert_eq!(page.data.len(), 1);
    assert_eq!(page.data[0].id.tx_digest, "Tx1");
}

#[tokio::test]
async fn shadow_fires_in_background() {
    let shadow_inner = FakeSource::new(vec![]);
    let shadow_count = shadow_inner.count();
    let primary = FakeSource::new(vec![make_event("Tx1", "mod")]);
    let source = ShadowEventSource::new(primary, shadow_inner);

    let _ = source.query_events("0xpkg", "mod", None, 10).await;

    // Give the spawned task time to run
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    assert_eq!(shadow_count.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn shadow_failure_does_not_affect_primary() {
    let primary = FakeSource::new(vec![make_event("Tx1", "gate")]);
    let shadow = FakeSource::failing();
    let source = ShadowEventSource::new(primary, shadow);

    let page = source
        .query_events("0xpkg", "gate", None, 10)
        .await
        .unwrap();

    assert_eq!(page.data.len(), 1);
    assert_eq!(page.data[0].id.tx_digest, "Tx1");
}

#[tokio::test]
async fn query_events_by_type_delegates_both() {
    let shadow_inner = FakeSource::new(vec![]);
    let shadow_count = shadow_inner.count();
    let primary = FakeSource::new(vec![make_event("Tx1", "gate")]);
    let primary_count = primary.count();
    let source = ShadowEventSource::new(primary, shadow_inner);

    let page = source
        .query_events_by_type("0xpkg::gate::LinkEvent", None, 10)
        .await
        .unwrap();

    assert_eq!(page.data.len(), 1);
    assert_eq!(primary_count.load(Ordering::SeqCst), 1);

    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    assert_eq!(shadow_count.load(Ordering::SeqCst), 1);
}
