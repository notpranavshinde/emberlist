package com.notpr.emberlist.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.notpr.emberlist.data.model.TaskEntity
import com.notpr.emberlist.data.model.ProjectTaskCount
import com.notpr.emberlist.data.model.TaskStatus
import kotlinx.coroutines.flow.Flow

@Dao
interface TaskDao {
    @Query("SELECT * FROM tasks WHERE projectId IS NULL AND parentTaskId IS NULL AND status = :status AND deletedAt IS NULL ORDER BY `order` ASC")
    fun observeInbox(status: TaskStatus = TaskStatus.OPEN): Flow<List<TaskEntity>>

    @Query("SELECT * FROM tasks WHERE parentTaskId IS NULL AND status = :status AND dueAt IS NOT NULL AND dueAt <= :endOfDay AND deletedAt IS NULL ORDER BY dueAt ASC")
    fun observeToday(status: TaskStatus = TaskStatus.OPEN, endOfDay: Long): Flow<List<TaskEntity>>

    @Query(
        "SELECT * FROM tasks " +
            "WHERE parentTaskId IS NULL " +
            "AND status = :status " +
            "AND completedAt IS NOT NULL " +
            "AND deletedAt IS NULL " +
            "AND completedAt BETWEEN :startOfDay AND :endOfDay " +
            "ORDER BY completedAt DESC"
    )
    fun observeCompletedToday(
        startOfDay: Long,
        endOfDay: Long,
        status: TaskStatus = TaskStatus.COMPLETED
    ): Flow<List<TaskEntity>>

    @Query("SELECT * FROM tasks WHERE parentTaskId IS NULL AND status = :status AND dueAt IS NOT NULL AND dueAt >= :startOfTomorrow AND deletedAt IS NULL ORDER BY dueAt ASC")
    fun observeUpcoming(status: TaskStatus = TaskStatus.OPEN, startOfTomorrow: Long): Flow<List<TaskEntity>>

    @Query("""
        SELECT * FROM tasks
        WHERE parentTaskId IS NULL
          AND status = :status
          AND recurringRule IS NOT NULL
          AND dueAt IS NOT NULL
          AND deletedAt IS NULL
          AND dueAt < :startOfTomorrow
        ORDER BY dueAt ASC
    """)
    fun observeOverdueRecurring(
        status: TaskStatus = TaskStatus.OPEN,
        startOfTomorrow: Long
    ): Flow<List<TaskEntity>>

    @Query("SELECT * FROM tasks WHERE projectId = :projectId AND parentTaskId IS NULL AND status = :status AND deletedAt IS NULL ORDER BY `order` ASC")
    fun observeProjectTasks(projectId: String, status: TaskStatus = TaskStatus.OPEN): Flow<List<TaskEntity>>

    @Query("SELECT * FROM tasks WHERE id = :id AND deletedAt IS NULL")
    fun observeTask(id: String): Flow<TaskEntity?>

    @Query("SELECT * FROM tasks WHERE id = :id AND deletedAt IS NULL")
    suspend fun getTask(id: String): TaskEntity?

    @Query("SELECT * FROM tasks")
    suspend fun getAll(): List<TaskEntity>

    @Query("SELECT id FROM tasks WHERE status = :status AND deletedAt IS NULL")
    suspend fun getTaskIdsByStatus(status: TaskStatus): List<String>

    @Query("SELECT id FROM tasks WHERE projectId = :projectId AND deletedAt IS NULL")
    suspend fun getTaskIdsByProject(projectId: String): List<String>

    @Query("SELECT * FROM tasks WHERE parentTaskId = :parentId AND status = :status AND deletedAt IS NULL ORDER BY `order` ASC")
    fun observeSubtasks(parentId: String, status: TaskStatus = TaskStatus.OPEN): Flow<List<TaskEntity>>

    @Query("SELECT * FROM tasks WHERE parentTaskId IN (:parentIds) AND status = :status AND deletedAt IS NULL ORDER BY parentTaskId, `order` ASC")
    fun observeSubtasksForParents(parentIds: List<String>, status: TaskStatus = TaskStatus.OPEN): Flow<List<TaskEntity>>

    @Query("SELECT * FROM tasks WHERE parentTaskId = :parentId AND status = :status AND deletedAt IS NULL ORDER BY `order` ASC")
    suspend fun getSubtasks(parentId: String, status: TaskStatus = TaskStatus.OPEN): List<TaskEntity>

    @Query("""
        SELECT * FROM tasks
        WHERE parentTaskId IS NULL
          AND status = :status
          AND deletedAt IS NULL
          AND (title LIKE '%' || :query || '%' OR description LIKE '%' || :query || '%')
        ORDER BY updatedAt DESC
    """)
    fun search(query: String, status: TaskStatus = TaskStatus.OPEN): Flow<List<TaskEntity>>

    @Query("""
        SELECT projectId as projectId, COUNT(*) as count
        FROM tasks
        WHERE status = :status
          AND parentTaskId IS NULL
          AND deletedAt IS NULL
        GROUP BY projectId
    """)
    fun observeProjectTaskCounts(status: TaskStatus = TaskStatus.OPEN): Flow<List<ProjectTaskCount>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(task: TaskEntity)

    @Update
    suspend fun update(task: TaskEntity)

    @Query("UPDATE tasks SET deletedAt = :deletedAt, updatedAt = :updatedAt WHERE id = :id OR parentTaskId = :id")
    suspend fun softDelete(id: String, deletedAt: Long, updatedAt: Long)

    @Query("UPDATE tasks SET deletedAt = :deletedAt, updatedAt = :updatedAt WHERE status = 'COMPLETED' AND deletedAt IS NULL")
    suspend fun softDeleteCompleted(deletedAt: Long, updatedAt: Long)

    @Query("UPDATE tasks SET sectionId = NULL WHERE sectionId = :sectionId")
    suspend fun clearSection(sectionId: String)

    @Query("UPDATE tasks SET deletedAt = :deletedAt, updatedAt = :updatedAt WHERE projectId = :projectId AND deletedAt IS NULL")
    suspend fun softDeleteByProject(projectId: String, deletedAt: Long, updatedAt: Long)
}
