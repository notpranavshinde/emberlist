package com.notpr.emberlist.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.notpr.emberlist.data.model.LocationEntity

@Dao
interface LocationDao {
    @Query("SELECT * FROM locations ORDER BY updatedAt DESC")
    suspend fun getAll(): List<LocationEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(location: LocationEntity)
}
