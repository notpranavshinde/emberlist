package com.notpr.emberlist.data.model

import androidx.room.TypeConverter

class Converters {
    @TypeConverter
    fun toPriority(value: String?): Priority? = value?.let { Priority.valueOf(it) }

    @TypeConverter
    fun fromPriority(value: Priority?): String? = value?.name

    @TypeConverter
    fun toTaskStatus(value: String?): TaskStatus? = value?.let { TaskStatus.valueOf(it) }

    @TypeConverter
    fun fromTaskStatus(value: TaskStatus?): String? = value?.name

    @TypeConverter
    fun toReminderType(value: String?): ReminderType? = value?.let { ReminderType.valueOf(it) }

    @TypeConverter
    fun fromReminderType(value: ReminderType?): String? = value?.name

    @TypeConverter
    fun toLocationTriggerType(value: String?): LocationTriggerType? = value?.let { LocationTriggerType.valueOf(it) }

    @TypeConverter
    fun fromLocationTriggerType(value: LocationTriggerType?): String? = value?.name

    @TypeConverter
    fun toViewPreference(value: String?): ViewPreference? = value?.let { ViewPreference.valueOf(it) }

    @TypeConverter
    fun fromViewPreference(value: ViewPreference?): String? = value?.name

    @TypeConverter
    fun toActivityType(value: String?): ActivityType? = value?.let { ActivityType.valueOf(it) }

    @TypeConverter
    fun fromActivityType(value: ActivityType?): String? = value?.name

    @TypeConverter
    fun toObjectType(value: String?): ObjectType? = value?.let { ObjectType.valueOf(it) }

    @TypeConverter
    fun fromObjectType(value: ObjectType?): String? = value?.name
}
