package com.notpr.emberlist.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.notpr.emberlist.data.dao.ActivityDao
import com.notpr.emberlist.data.dao.ProjectDao
import com.notpr.emberlist.data.dao.ReminderDao
import com.notpr.emberlist.data.dao.SectionDao
import com.notpr.emberlist.data.dao.TaskDao
import com.notpr.emberlist.data.model.ActivityEventEntity
import com.notpr.emberlist.data.model.Converters
import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.ReminderEntity
import com.notpr.emberlist.data.model.SectionEntity
import com.notpr.emberlist.data.model.TaskEntity

@Database(
    entities = [
        ProjectEntity::class,
        SectionEntity::class,
        TaskEntity::class,
        ReminderEntity::class,
        ActivityEventEntity::class
    ],
    version = 2,
    exportSchema = true
)
@TypeConverters(Converters::class)
abstract class EmberlistDatabase : RoomDatabase() {
    abstract fun projectDao(): ProjectDao
    abstract fun sectionDao(): SectionDao
    abstract fun taskDao(): TaskDao
    abstract fun reminderDao(): ReminderDao
    abstract fun activityDao(): ActivityDao

    companion object {
        private const val DB_NAME = "emberlist.db"

        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS activity_events (
                        id TEXT NOT NULL,
                        type TEXT NOT NULL,
                        objectType TEXT NOT NULL,
                        objectId TEXT NOT NULL,
                        payloadJson TEXT NOT NULL,
                        createdAt INTEGER NOT NULL,
                        PRIMARY KEY(id)
                    )
                    """.trimIndent()
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS index_activity_events_objectId ON activity_events(objectId)")
            }
        }

        fun build(context: Context): EmberlistDatabase {
            return Room.databaseBuilder(context, EmberlistDatabase::class.java, DB_NAME)
                .addMigrations(MIGRATION_1_2)
                .build()
        }
    }
}
