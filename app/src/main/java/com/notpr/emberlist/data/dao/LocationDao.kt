package com.notpr.emberlist.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.notpr.emberlist.data.model.LocationEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface LocationDao {
    @Query("SELECT * FROM locations WHERE id = :id")
    fun observe(id: String): Flow<LocationEntity?>

    @Query("SELECT * FROM locations WHERE id = :id")
    suspend fun get(id: String): LocationEntity?

    @Query("SELECT * FROM locations WHERE id IN (:ids)")
    suspend fun getByIds(ids: List<String>): List<LocationEntity>

    @Query("SELECT * FROM locations ORDER BY updatedAt DESC")
    suspend fun getAll(): List<LocationEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(location: LocationEntity)

    @Query("DELETE FROM locations WHERE id = :id")
    suspend fun delete(id: String)
}
