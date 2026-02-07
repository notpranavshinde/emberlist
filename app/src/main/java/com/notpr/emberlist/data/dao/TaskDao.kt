package com.notpr.emberlist.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.TaskStatus
import kotlinx.coroutines.flow.Flow

@Dao
interface TaskDao {
    @Query("SELECT * FROM tasks WHERE projectId IS NULL AND status = :status ORDER BY `order` ASC")
    fun observeInbox(status: TaskStatus = TaskStatus.OPEN): Flow<List<TaskEntity>>

    @Query("SELECT * FROM tasks WHERE status = :status AND dueAt IS NOT NULL AND dueAt <= :endOfDay ORDER BY dueAt ASC")
    fun observeToday(status: TaskStatus = TaskStatus.OPEN, endOfDay: Long): Flow<List<TaskEntity>>

    @Query("SELECT * FROM tasks WHERE status = :status AND dueAt IS NOT NULL AND dueAt >= :startOfTomorrow ORDER BY dueAt ASC")
    fun observeUpcoming(status: TaskStatus = TaskStatus.OPEN, startOfTomorrow: Long): Flow<List<TaskEntity>>

    @Query("""
        SELECT * FROM tasks
        WHERE status = :status
          AND recurringRule IS NOT NULL
          AND dueAt IS NOT NULL
          AND dueAt < :startOfTomorrow
        ORDER BY dueAt ASC
    """)
    fun observeOverdueRecurring(
        status: TaskStatus = TaskStatus.OPEN,
        startOfTomorrow: Long
    ): Flow<List<TaskEntity>>

    @Query("SELECT * FROM tasks WHERE projectId = :projectId AND status = :status ORDER BY `order` ASC")
    fun observeProjectTasks(projectId: String, status: TaskStatus = TaskStatus.OPEN): Flow<List<TaskEntity>>

    @Query("SELECT * FROM tasks WHERE id = :id")
    fun observeTask(id: String): Flow<TaskEntity?>

    @Query("SELECT * FROM tasks")
    suspend fun getAll(): List<TaskEntity>

    @Query("SELECT * FROM tasks WHERE parentTaskId = :parentId ORDER BY `order` ASC")
    fun observeSubtasks(parentId: String): Flow<List<TaskEntity>>

    @Query("SELECT * FROM tasks WHERE title LIKE '%' || :query || '%' OR description LIKE '%' || :query || '%' ORDER BY updatedAt DESC")
    fun search(query: String): Flow<List<TaskEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(task: TaskEntity)

    @Update
    suspend fun update(task: TaskEntity)

    @Query("DELETE FROM tasks WHERE id = :id")
    suspend fun delete(id: String)

    @Query("DELETE FROM tasks WHERE status = 'COMPLETED'")
    suspend fun deleteCompleted()

    @Query("UPDATE tasks SET sectionId = NULL WHERE sectionId = :sectionId")
    suspend fun clearSection(sectionId: String)
}
