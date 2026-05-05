//! Quick migration runner for 0010_eve_world_data.sql
use sqlx::PgPool;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let url = std::env::var("EFREP_DATABASE_URL")
        .map_err(|_| anyhow::anyhow!("EFREP_DATABASE_URL not set"))?;
    let pool = PgPool::connect(&url).await?;

    let sql = std::fs::read_to_string("migrations/0010_eve_world_data.sql")?;

    // Split on semicolons and execute each statement
    let mut conn = pool.acquire().await?;
    for stmt in sql.split(';').map(|s| s.trim()).filter(|s| !s.is_empty()) {
        let preview: String = stmt.chars().take(60).collect();
        println!("Executing: {preview}...");
        sqlx::query(stmt).execute(&mut *conn).await?;
    }

    println!("Migration 0010 applied successfully");
    Ok(())
}
