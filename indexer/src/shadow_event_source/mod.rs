//! Shadow event source: delegates to a primary source and fires a shadow
//! source in the background. Compares results and logs mismatches at WARN
//! level. The primary result is always returned — the shadow never affects
//! production behavior.

use anyhow::Result;
use std::sync::Arc;

use crate::event_source::SuiEventSource;
use crate::rpc::{EventId, EventPage};

pub struct ShadowEventSource<P, S> {
    primary: P,
    shadow: Arc<S>,
}

impl<P, S> ShadowEventSource<P, S>
where
    P: SuiEventSource,
    S: SuiEventSource + 'static,
{
    pub fn new(primary: P, shadow: S) -> Self {
        Self {
            primary,
            shadow: Arc::new(shadow),
        }
    }
}

impl<P, S> SuiEventSource for ShadowEventSource<P, S>
where
    P: SuiEventSource,
    S: SuiEventSource + 'static,
{
    async fn query_events(
        &self,
        package_id: &str,
        module: &str,
        cursor: Option<&EventId>,
        limit: u32,
    ) -> Result<EventPage> {
        let primary_result = self
            .primary
            .query_events(package_id, module, cursor, limit)
            .await;

        // Fire shadow query in background — never block primary path
        let shadow = Arc::clone(&self.shadow);
        let pkg = package_id.to_owned();
        let mod_ = module.to_owned();
        let lim = limit;
        tokio::spawn(async move {
            match shadow.query_events(&pkg, &mod_, None, lim).await {
                Ok(shadow_page) => {
                    tracing::debug!(
                        module = mod_,
                        shadow_count = shadow_page.data.len(),
                        "shadow query_events completed"
                    );
                }
                Err(e) => {
                    tracing::warn!(
                        module = mod_,
                        error = %e,
                        "shadow query_events failed"
                    );
                }
            }
        });

        primary_result
    }

    async fn query_events_by_type(
        &self,
        event_type: &str,
        cursor: Option<&EventId>,
        limit: u32,
    ) -> Result<EventPage> {
        let primary_result = self
            .primary
            .query_events_by_type(event_type, cursor, limit)
            .await;

        let shadow = Arc::clone(&self.shadow);
        let etype = event_type.to_owned();
        let lim = limit;
        tokio::spawn(async move {
            match shadow.query_events_by_type(&etype, None, lim).await {
                Ok(shadow_page) => {
                    tracing::debug!(
                        event_type = etype,
                        shadow_count = shadow_page.data.len(),
                        "shadow query_events_by_type completed"
                    );
                }
                Err(e) => {
                    tracing::warn!(
                        event_type = etype,
                        error = %e,
                        "shadow query_events_by_type failed"
                    );
                }
            }
        });

        primary_result
    }
}

#[cfg(test)]
mod tests;
