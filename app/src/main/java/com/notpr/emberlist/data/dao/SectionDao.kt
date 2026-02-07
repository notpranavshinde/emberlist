package com.notpr.emberlist.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.notpr.emberlist.data.model.SectionEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface SectionDao {
    @Query("SELECT * FROM sections WHERE projectId = :projectId ORDER BY `order` ASC")
    fun observeSections(projectId: String): Flow<List<SectionEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(section: SectionEntity)

    @Query("SELECT * FROM sections")
    suspend fun getAll(): List<SectionEntity>

    @Update
    suspend fun update(section: SectionEntity)

    @Query("DELETE FROM sections WHERE id = :id")
    suspend fun delete(id: String)
}
