package com.notpr.emberlist.ui

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.ListAlt
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.notpr.emberlist.R
import com.notpr.emberlist.ui.screens.BrowseScreen
import com.notpr.emberlist.ui.screens.InboxScreen
import com.notpr.emberlist.ui.screens.ProjectScreen
import com.notpr.emberlist.ui.screens.SearchScreen
import com.notpr.emberlist.ui.screens.SettingsScreen
import com.notpr.emberlist.ui.screens.TaskDetailScreen
import com.notpr.emberlist.ui.screens.TodayScreen
import com.notpr.emberlist.ui.screens.UpcomingScreen
import com.notpr.emberlist.ui.screens.quickadd.QuickAddSheet

sealed class NavRoute(val route: String, val labelRes: Int, val icon: @Composable () -> Unit) {
    object Inbox : NavRoute("inbox", R.string.inbox, { Icon(Icons.Default.Inbox, null) })
    object Today : NavRoute("today", R.string.today, { Icon(Icons.Default.CalendarMonth, null) })
    object Upcoming : NavRoute("upcoming", R.string.upcoming, { Icon(Icons.Default.ListAlt, null) })
    object Browse : NavRoute("browse", R.string.browse, { Icon(Icons.Default.Menu, null) })
}

@Composable
fun EmberlistAppRoot(openTaskId: String?, onTaskOpened: () -> Unit) {
    val navController = rememberNavController()
    val navItems = listOf(NavRoute.Inbox, NavRoute.Today, NavRoute.Upcoming, NavRoute.Browse)

    LaunchedEffect(openTaskId) {
        if (!openTaskId.isNullOrBlank()) {
            navController.navigate("task/$openTaskId")
            onTaskOpened()
        }
    }

    Scaffold(
        topBar = { TopBar(navController) },
        bottomBar = { BottomBar(navController, navItems) },
        floatingActionButton = { QuickAddSheet() }
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = NavRoute.Inbox.route,
            modifier = Modifier
        ) {
            composable(NavRoute.Inbox.route) { InboxScreen(padding, navController) }
            composable(NavRoute.Today.route) { TodayScreen(padding, navController) }
            composable(NavRoute.Upcoming.route) { UpcomingScreen(padding, navController) }
            composable(NavRoute.Browse.route) { BrowseScreen(padding, navController) }
            composable("project/{projectId}") { backStack ->
                val projectId = backStack.arguments?.getString("projectId") ?: return@composable
                ProjectScreen(padding, projectId, navController)
            }
            composable("task/{taskId}") { backStack ->
                val taskId = backStack.arguments?.getString("taskId") ?: return@composable
                TaskDetailScreen(padding, taskId)
            }
            composable("settings") { SettingsScreen(padding) }
            composable("search") { SearchScreen(padding, navController) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TopBar(navController: NavHostController) {
    val currentBackStack by navController.currentBackStackEntryAsState()
    val route = currentBackStack?.destination?.route
    val isRoot = route == NavRoute.Inbox.route ||
        route == NavRoute.Today.route ||
        route == NavRoute.Upcoming.route ||
        route == NavRoute.Browse.route
    val title = when (route) {
        NavRoute.Inbox.route -> stringResource(R.string.inbox)
        NavRoute.Today.route -> stringResource(R.string.today)
        NavRoute.Upcoming.route -> stringResource(R.string.upcoming)
        NavRoute.Browse.route -> stringResource(R.string.browse)
        else -> stringResource(R.string.app_name)
    }
    TopAppBar(
        title = { Text(title) },
        navigationIcon = {
            if (!isRoot && navController.previousBackStackEntry != null) {
                IconButton(onClick = { navController.popBackStack() }) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            }
        },
        actions = {
            IconButton(onClick = { navController.navigate("search") }) {
                Icon(Icons.Default.Search, contentDescription = "Search")
            }
        }
    )
}

@Composable
private fun BottomBar(navController: NavHostController, items: List<NavRoute>) {
    val currentBackStack by navController.currentBackStackEntryAsState()
    val currentRoute = currentBackStack?.destination?.route
    NavigationBar {
        items.forEach { item ->
            NavigationBarItem(
                selected = currentRoute == item.route,
                onClick = {
                    navController.navigate(item.route) {
                        popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                icon = item.icon,
                label = { Text(stringResource(item.labelRes)) }
            )
        }
    }
}
