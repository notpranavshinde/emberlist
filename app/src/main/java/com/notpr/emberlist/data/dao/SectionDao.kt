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
    @Query("SELECT * FROM sections WHERE projectId = :projectId AND deletedAt IS NULL ORDER BY `order` ASC")
    fun observeSections(projectId: String): Flow<List<SectionEntity>>

    @Query("SELECT * FROM sections WHERE deletedAt IS NULL")
    fun observeAllSections(): Flow<List<SectionEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(section: SectionEntity)

    @Query("SELECT * FROM sections")
    suspend fun getAll(): List<SectionEntity>

    @Query("SELECT * FROM sections WHERE projectId = :projectId AND name = :name AND deletedAt IS NULL LIMIT 1")
    suspend fun getByProjectAndName(projectId: String, name: String): SectionEntity?

    @Update
    suspend fun update(section: SectionEntity)

    @Query("UPDATE sections SET deletedAt = :deletedAt, updatedAt = :updatedAt WHERE id = :id")
    suspend fun softDelete(id: String, deletedAt: Long, updatedAt: Long)

    @Query("UPDATE sections SET deletedAt = :deletedAt, updatedAt = :updatedAt WHERE projectId = :projectId AND deletedAt IS NULL")
    suspend fun softDeleteByProject(projectId: String, deletedAt: Long, updatedAt: Long)
}
