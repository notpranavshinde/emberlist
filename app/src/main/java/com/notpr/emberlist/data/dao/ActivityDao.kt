package com.notpr.emberlist.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.notpr.emberlist.data.model.ActivityEventEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ActivityDao {
    @Query("SELECT * FROM activity_events WHERE objectId = :objectId ORDER BY createdAt DESC")
    fun observeForObject(objectId: String): Flow<List<ActivityEventEntity>>

    @Query("SELECT * FROM activity_events")
    suspend fun getAll(): List<ActivityEventEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(event: ActivityEventEntity)
}
