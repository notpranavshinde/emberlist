package com.notpr.emberlist.ui.screens

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.notpr.emberlist.LocalAppContainer
import com.notpr.emberlist.ui.EmberlistViewModelFactory
import com.notpr.emberlist.ui.components.TaskRow

@Composable
fun TodayScreen(padding: PaddingValues, navController: NavHostController) {
    val container = LocalAppContainer.current
    val viewModel: TodayViewModel = viewModel(factory = EmberlistViewModelFactory(container))
    val tasks by viewModel.tasks.collectAsState()

    LazyColumn(contentPadding = padding) {
        items(tasks, key = { it.id }) { task ->
            TaskRow(
                task = task,
                onToggle = viewModel::toggleComplete,
                onClick = { navController.navigate("task/${task.id}") }
            )
        }
    }
}
