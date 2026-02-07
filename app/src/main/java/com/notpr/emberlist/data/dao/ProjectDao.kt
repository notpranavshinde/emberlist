package com.notpr.emberlist.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.notpr.emberlist.data.model.ProjectEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ProjectDao {
    @Query("SELECT * FROM projects WHERE archived = 0 ORDER BY `order` ASC")
    fun observeActiveProjects(): Flow<List<ProjectEntity>>

    @Query("SELECT * FROM projects WHERE id = :id")
    fun observeProject(id: String): Flow<ProjectEntity?>

    @Query("SELECT * FROM projects WHERE name = :name LIMIT 1")
    suspend fun getByName(name: String): ProjectEntity?

    @Query("SELECT * FROM projects")
    suspend fun getAll(): List<ProjectEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(project: ProjectEntity)

    @Update
    suspend fun update(project: ProjectEntity)

    @Query("DELETE FROM projects WHERE id = :id")
    suspend fun delete(id: String)
}
