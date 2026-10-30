"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseRules = void 0;
const ruleHelpers_1 = require("./ruleHelpers");
const SQL_CLIENTS = new Set(["psql", "mysql", "mariadb", "sqlite3", "sqlcmd", "clickhouse-client", "cockroach", "mongo", "mongosh", "redis-cli"]);
const DB_ADMIN = new Set(["dropdb", "createdb", "mysqladmin", "pg_dump", "pg_restore", "pg_dumpall"]);
const MIGRATION_RUNNERS = new Set(["prisma", "rails", "rake", "knex", "sequelize", "sequelize-cli", "typeorm", "npx", "pnpm", "yarn", "npm", "bundle", "bin/rails", "alembic", "flyway", "liquibase"]);
const WRITE_RE = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|replace|merge|vacuum)\b/i;
const REDIS_WRITE_RE = /\b(flushall|flushdb|set|del|expire|rename|hset|lpush|rpush|sadd|zadd|config\s+set)\b/i;
function textOf(ctx) {
    return ctx.segment.args.map((t) => t.value).join(" ");
}
/** Does the segment name a production database, by explicit host or database name? */
function productionTarget(ctx) {
    const cfg = ctx.config.environment;
    const argText = textOf(ctx);
    const host = (0, ruleHelpers_1.containsHost)(argText, cfg.productionDatabaseHosts);
    if (host)
        return `host ${host}`;
    for (const t of ctx.segment.args) {
        const v = t.value;
        for (const name of cfg.productionDatabaseNames) {
            if (!name)
                continue;
            if (v === name || v.endsWith("/" + name) || v.endsWith("=" + name) || v.includes(`/${name}?`))
                return `database ${name}`;
        }
    }
    // Fall back to environment variables only when the command names no explicit host.
    const explicitHost = ctx.segment.args.some((t) => /^(-h|--host(=.*)?|--hostname(=.*)?|[a-z]+:\/\/)/.test(t.value) || t.value.startsWith("-h"));
    if (!explicitHost) {
        const envVals = [ctx.env.PGHOST, ctx.env.MYSQL_HOST, ctx.env.DATABASE_URL, ctx.env.DB_URL, ctx.env.POSTGRES_URL, ctx.env.MYSQL_URL, ctx.env.MONGODB_URI, ctx.env.REDIS_URL, ...ctx.environment.databaseUrls].filter((x) => typeof x === "string");
        for (const v of envVals) {
            const h = (0, ruleHelpers_1.containsHost)(v, cfg.productionDatabaseHosts);
            if (h)
                return `host ${h} (from environment variables)`;
        }
        for (const name of cfg.productionDatabaseNames) {
            if (name && ctx.env.PGDATABASE === name)
                return `database ${name} (from PGDATABASE)`;
        }
    }
    return null;
}
function isProductionEnvVar(ctx) {
    for (const k of ["NODE_ENV", "RAILS_ENV", "APP_ENV", "RACK_ENV", "ENVIRONMENT", "DJANGO_ENV"]) {
        const v = ctx.env[k];
        if (typeof v === "string" && /^prod(uction)?$/i.test(v))
            return `${k}=${v}`;
    }
    return productionHostInEnv(ctx);
}
function productionHostInEnv(ctx) {
    const vals = [ctx.env.DATABASE_URL, ctx.env.DB_URL, ...ctx.environment.databaseUrls].filter((x) => typeof x === "string");
    for (const v of vals) {
        const h = (0, ruleHelpers_1.containsHost)(v, ctx.config.environment.productionDatabaseHosts);
        if (h)
            return `DATABASE_URL points at ${h}`;
    }
    return null;
}
function sqlFindings(text, client) {
    const out = [];
    if (/\bdrop\s+(database|schema)\b/i.test(text))
        out.push((0, ruleHelpers_1.finding)("DB_DROP_DATABASE", "database", "HIGH", "This SQL drops an entire database or schema."));
    if (/\bdrop\s+table\b/i.test(text))
        out.push((0, ruleHelpers_1.finding)("DB_DROP_TABLE", "database", "HIGH", "This SQL drops a table and all its rows."));
    if (/\btruncate\b/i.test(text))
        out.push((0, ruleHelpers_1.finding)("DB_TRUNCATE", "database", "HIGH", "TRUNCATE removes every row from the table."));
    if (/\bdelete\s+from\b/i.test(text) && !/\bwhere\b/i.test(text)) {
        out.push((0, ruleHelpers_1.finding)("DB_DELETE_NO_WHERE", "database", "HIGH", "DELETE without a WHERE clause removes every row."));
    }
    if (/\bupdate\b[\s\S]+\bset\b/i.test(text) && !/\bwhere\b/i.test(text)) {
        out.push((0, ruleHelpers_1.finding)("DB_UPDATE_NO_WHERE", "database", "HIGH", "UPDATE without a WHERE clause changes every row."));
    }
    if (client === "redis-cli" && /\bflush(all|db)\b/i.test(text)) {
        out.push((0, ruleHelpers_1.finding)("DB_REDIS_FLUSH", "database", "HIGH", "FLUSHALL/FLUSHDB deletes all keys."));
    }
    if ((client === "mongo" || client === "mongosh") && /(\.drop\s*\(|dropDatabase\s*\(|deleteMany\s*\(\s*\{\s*\}\s*\))/.test(text)) {
        out.push((0, ruleHelpers_1.finding)("DB_MONGO_DROP", "database", "HIGH", "This drops a collection/database or deletes all documents."));
    }
    return out;
}
const databaseRules = (ctx) => {
    const s = ctx.segment;
    const cmd = s.executable;
    if (!cmd)
        return [];
    const out = [];
    const text = textOf(ctx);
    if (SQL_CLIENTS.has(cmd) || DB_ADMIN.has(cmd)) {
        const dest = sqlFindings(text, cmd);
        let writes = dest.length > 0 || (cmd === "redis-cli" ? REDIS_WRITE_RE.test(text) : WRITE_RE.test(text));
        if (cmd === "dropdb" || (cmd === "mysqladmin" && /\b(drop|flush-|shutdown|kill)\b/.test(text))) {
            dest.push((0, ruleHelpers_1.finding)("DB_DROP_DATABASE", "database", "HIGH", `${cmd} drops or disrupts a database.`));
            writes = true;
        }
        if (cmd === "pg_restore" && (s.args.some((t) => t.value === "-c" || t.value === "--clean") || /--clean\b/.test(text))) {
            dest.push((0, ruleHelpers_1.finding)("DB_RESTORE_CLEAN", "database", "HIGH", "pg_restore --clean drops existing objects before recreating them."));
            writes = true;
        }
        if (cmd === "pg_restore" || cmd === "createdb")
            writes = true;
        const fileArg = (cmd === "psql" && s.args.some((t) => t.value === "-f" || t.value === "--file" || t.value.startsWith("--file="))) ||
            s.redirections.some((r) => r.op === "<");
        if (fileArg && (cmd === "psql" || cmd === "mysql" || cmd === "mariadb" || cmd === "sqlite3")) {
            dest.push((0, ruleHelpers_1.finding)("DB_SQL_SCRIPT", "database", "MEDIUM", "A SQL script file is executed; its contents are not analysed."));
            writes = true;
        }
        out.push(...dest);
        const prod = productionTarget(ctx);
        if (prod) {
            if (writes && cmd !== "pg_dump" && cmd !== "pg_dumpall") {
                out.push((0, ruleHelpers_1.finding)("DB_PRODUCTION_WRITE", "database", "CRITICAL", `Write or destructive database operation against a protected production target (${prod}).`, {
                    block: true,
                    mandatory: true,
                }));
            }
            else {
                out.push((0, ruleHelpers_1.finding)("DB_PRODUCTION_CONNECT", "database", "HIGH", `This connects to a protected production target (${prod}).`, {
                    mandatory: true,
                    requiresConfirmation: true,
                }));
            }
        }
    }
    // Migration tools (also matched when launched through npx / yarn / bundle ...)
    if (MIGRATION_RUNNERS.has(cmd)) {
        const full = `${cmd} ${text}`;
        let destructive = false;
        let routine = false;
        if (/\bprisma\s+migrate\s+reset\b/.test(full) || /\bprisma\s+db\s+push\b[^\n]*--force-reset/.test(full)) {
            destructive = true;
            out.push((0, ruleHelpers_1.finding)("DB_MIGRATION_RESET", "database", "HIGH", "This resets the database and deletes all data."));
        }
        else if (/\bdb:(drop|reset|schema:load|setup|purge|migrate:reset|migrate:undo:all)\b/.test(full)) {
            destructive = true;
            out.push((0, ruleHelpers_1.finding)("DB_MIGRATION_RESET", "database", "HIGH", "This drops or rebuilds the database and can delete all data."));
        }
        else if (/\bmigrate:rollback\b[^\n]*--all/.test(full) || /\btypeorm\s+schema:drop\b/.test(full) || /\bflyway\s+clean\b/.test(full)) {
            destructive = true;
            out.push((0, ruleHelpers_1.finding)("DB_MIGRATION_RESET", "database", "HIGH", "This rolls back every migration or drops the schema."));
        }
        else if (/\bprisma\s+migrate\s+(deploy|dev)\b/.test(full) || /\bdb:migrate\b/.test(full) || /\bmigrate:(latest|up|rollback)\b/.test(full) || /\balembic\s+(upgrade|downgrade)\b/.test(full) || /\bflyway\s+migrate\b/.test(full)) {
            routine = true;
            out.push((0, ruleHelpers_1.finding)("DB_MIGRATION_RUN", "database", "MEDIUM", "This applies or reverts database schema migrations."));
        }
        if (destructive || routine) {
            const prod = isProductionEnvVar(ctx) ?? productionTarget(ctx);
            if (prod) {
                if (destructive) {
                    out.push((0, ruleHelpers_1.finding)("DB_PRODUCTION_MIGRATION", "database", "CRITICAL", `Destructive migration against a production environment (${prod}).`, {
                        block: true,
                        mandatory: true,
                    }));
                }
                else {
                    out.push((0, ruleHelpers_1.finding)("DB_PRODUCTION_MIGRATION", "database", "HIGH", `Migration run in a production environment (${prod}).`, {
                        mandatory: true,
                        requiresConfirmation: true,
                    }));
                }
            }
        }
    }
    return out;
};
exports.databaseRules = databaseRules;
