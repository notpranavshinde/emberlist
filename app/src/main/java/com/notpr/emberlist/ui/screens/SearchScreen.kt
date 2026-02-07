package com.notpr.emberlist.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.notpr.emberlist.LocalAppContainer
import com.notpr.emberlist.ui.EmberlistViewModelFactory
import com.notpr.emberlist.ui.components.TaskRow

@Composable
fun SearchScreen(padding: PaddingValues, navController: NavHostController) {
    val container = LocalAppContainer.current
    val viewModel: SearchViewModel = viewModel(factory = EmberlistViewModelFactory(container))
    val results by viewModel.results.collectAsState()
    var query by remember { mutableStateOf("") }

    Column(modifier = Modifier.padding(padding)) {
        OutlinedTextField(
            value = query,
            onValueChange = {
                query = it
                viewModel.updateQuery(it)
            },
            label = { Text("Search") },
            modifier = Modifier.fillMaxWidth().padding(16.dp)
        )
        LazyColumn {
            items(results, key = { it.id }) { task ->
                TaskRow(
                    task = task,
                    onToggle = {},
                    onClick = { navController.navigate("task/${task.id}") }
                )
            }
        }
    }
}
