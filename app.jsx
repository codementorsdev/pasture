import React, { useState, useEffect, useCallback } from 'react';
import { GitBranch, Play, RefreshCw, CheckCircle, XCircle, Loader2, ServerCog, Terminal, Tag, FileText, ChevronDown, ChevronUp } from 'lucide-react'; // Importing new icons

// Main App component
const App = () => {
    // In a real production application, these sensitive values would NOT be hardcoded.
    // They would be loaded securely from environment variables (e.g., process.env.REACT_APP_GITLAB_PROJECT_ID)
    // during the build process, or fetched from a secure backend service.
    // For this demonstration, we are simulating their secure presence by initializing them here.
    const [projectId, setProjectId] = useState('YOUR_GITLAB_PROJECT_ID'); // REPLACE WITH YOUR ACTUAL PROJECT ID
    const [accessToken, setAccessToken] = useState('YOUR_GITLAB_ACCESS_TOKEN'); // REPLACE WITH YOUR ACTUAL ACCESS TOKEN

    // State variables for GitLab data and UI interactions
    const [branches, setBranches] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState('');
    const [mavenTags, setMavenTags] = useState('');
    const [pipelineStatus, setPipelineStatus] = useState('Idle');
    const [pipelineId, setPipelineId] = useState(null);
    const [artifactsUrl, setArtifactsUrl] = useState(''); // URL for generated artifacts
    const [jobLogs, setJobLogs] = useState([]); // New state for storing job logs
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // Base URL for GitLab API
    const GITLAB_API_BASE_URL = 'https://gitlab.com/api/v4'; // Adjust if using a self-hosted GitLab instance

    // Function to fetch branches from GitLab
    const fetchBranches = useCallback(async () => {
        // Only attempt to fetch if projectId and accessToken are provided (even if placeholders)
        if (projectId === 'YOUR_GITLAB_PROJECT_ID' || accessToken === 'YOUR_GITLAB_ACCESS_TOKEN') {
            setError('Please replace placeholder Project ID and Access Token in the code for functionality.');
            return;
        }

        setIsLoading(true);
        setError('');
        try {
            const response = await fetch(`${GITLAB_API_BASE_URL}/projects/${projectId}/repository/branches`, {
                headers: {
                    'Private-Token': accessToken,
                },
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Failed to fetch branches: ${response.status} ${response.statusText} - ${errorData.message || 'Unknown error'}`);
            }

            const data = await response.json();
            setBranches(data.map(branch => branch.name));
            if (data.length > 0) {
                setSelectedBranch(data[0].name); // Select the first branch by default
            } else {
                setBranches([]);
                setSelectedBranch('');
                setError('No branches found for this project.');
            }
        } catch (err) {
            setError(`Error fetching branches: ${err.message}`);
            console.error('Fetch branches error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [projectId, accessToken]);

    // Effect to fetch branches when component mounts or config changes
    useEffect(() => {
        fetchBranches();
    }, [fetchBranches]); // Re-run if fetchBranches callback changes (due to projectId/accessToken change)

    // Function to trigger a new pipeline
    const triggerPipeline = async () => {
        if (!projectId || !accessToken || !selectedBranch) {
            setError('Project ID, Access Token, and Branch are required to trigger a pipeline.');
            return;
        }
        setIsLoading(true);
        setError('');
        setPipelineStatus('Triggering...');
        setArtifactsUrl(''); // Clear previous artifacts URL
        setJobLogs([]); // Clear previous job logs

        try {
            // GitLab CI/CD variables are passed in the 'variables' array
            const variables = [];
            if (mavenTags) {
                variables.push({ key: 'MAVEN_CLI_ARGS', value: mavenTags });
            }

            const response = await fetch(`${GITLAB_API_BASE_URL}/projects/${projectId}/pipelines`, {
                method: 'POST',
                headers: {
                    'Private-Token': accessToken,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ref: selectedBranch,
                    variables: variables,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Failed to trigger pipeline: ${response.status} ${response.statusText} - ${errorData.message || 'Unknown error'}`);
            }

            const data = await response.json();
            setPipelineId(data.id);
            setPipelineStatus(`Pipeline ${data.id} started (${data.status}). Polling status...`);
        } catch (err) {
            setError(`Error triggering pipeline: ${err.message}`);
            console.error('Trigger pipeline error:', err);
            setPipelineStatus('Failed to trigger.');
        } finally {
            setIsLoading(false);
        }
    };

    // Function to fetch job logs for a given pipeline
    const fetchJobLogs = useCallback(async (currentPipelineId) => {
        if (!projectId || !accessToken || !currentPipelineId) {
            return;
        }
        try {
            // 1. Fetch jobs for the pipeline
            const jobsResponse = await fetch(`${GITLAB_API_BASE_URL}/projects/${projectId}/pipelines/${currentPipelineId}/jobs`, {
                headers: { 'Private-Token': accessToken },
            });

            if (!jobsResponse.ok) {
                const errorData = await jobsResponse.json();
                throw new Error(`Failed to fetch jobs: ${jobsResponse.status} ${jobsResponse.statusText} - ${errorData.message || 'Unknown error'}`);
            }
            const jobs = await jobsResponse.json();

            // 2. Fetch trace for each job
            const logsPromises = jobs.map(async (job) => {
                try {
                    const traceResponse = await fetch(`${GITLAB_API_BASE_URL}/projects/${projectId}/jobs/${job.id}/trace`, {
                        headers: { 'Private-Token': accessToken },
                    });

                    if (!traceResponse.ok) {
                        // If trace fails, return a placeholder error message
                        return {
                            id: job.id,
                            name: job.name,
                            status: job.status,
                            log: `Failed to fetch log for job ${job.name}: ${traceResponse.status} ${traceResponse.statusText}`,
                        };
                    }
                    const logContent = await traceResponse.text();
                    return {
                        id: job.id,
                        name: job.name,
                        status: job.status,
                        log: logContent,
                    };
                } catch (traceError) {
                    return {
                        id: job.id,
                        name: job.name,
                        status: job.status,
                        log: `Error fetching log for job ${job.name}: ${traceError.message}`,
                    };
                }
            });

            const fetchedLogs = await Promise.all(logsPromises);
            setJobLogs(fetchedLogs);

        } catch (err) {
            setError(`Error fetching job logs: ${err.message}`);
            console.error('Fetch job logs error:', err);
        }
    }, [projectId, accessToken]);


    // Function to poll pipeline status
    const pollPipelineStatus = useCallback(async () => {
        if (!projectId || !accessToken || !pipelineId) {
            return;
        }

        try {
            const response = await fetch(`${GITLAB_API_BASE_URL}/projects/${projectId}/pipelines/${pipelineId}`, {
                headers: {
                    'Private-Token': accessToken,
                },
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Failed to get pipeline status: ${response.status} ${response.statusText} - ${errorData.message || 'Unknown error'}`);
            }

            const data = await response.json();
            setPipelineStatus(`Pipeline ${data.id} status: ${data.status}`);

            if (data.status === 'success' || data.status === 'failed' || data.status === 'canceled' || data.status === 'skipped') {
                // Pipeline finished, stop polling and fetch logs
                setPipelineId(null); // Stop polling
                fetchJobLogs(data.id); // Fetch logs for the completed pipeline

                if (data.status === 'success') {
                    // In a real production scenario, the pipeline would publish artifacts to a web server.
                    // You would then fetch the URL of these artifacts here.
                    // For demonstration, we'll simulate a URL.
                    setArtifactsUrl(`https://example.com/artifacts/${projectId}/${pipelineId}/index.html`); // Placeholder URL
                    setPipelineStatus(`Pipeline ${data.id} completed successfully! Artifacts ready.`);
                } else {
                    setPipelineStatus(`Pipeline ${data.id} ${data.status}. Check logs for details.`);
                }
            }
        } catch (err) {
            setError(`Error polling pipeline status: ${err.message}`);
            console.error('Poll pipeline status error:', err);
            setPipelineStatus('Error during polling.');
            setPipelineId(null); // Stop polling on error
        }
    }, [projectId, accessToken, pipelineId, fetchJobLogs]);

    // Effect for polling pipeline status
    useEffect(() => {
        let intervalId;
        if (pipelineId) {
            intervalId = setInterval(pollPipelineStatus, 5000); // Poll every 5 seconds
        }
        return () => {
            if (intervalId) {
                clearInterval(intervalId); // Clean up interval on component unmount or pipeline completion/error
            }
        };
    }, [pipelineId, pollPipelineStatus]);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 font-inter p-6 flex flex-col items-center">
            <div className="container mx-auto bg-slate-900 rounded-2xl shadow-2xl p-8 space-y-8 max-w-4xl border border-slate-800">
                <h1 className="text-4xl font-extrabold text-center text-cyan-400 mb-8 flex items-center justify-center gap-4">
                    <ServerCog className="h-10 w-10 text-indigo-400" /> GitLab CI/CD Dashboard
                </h1>

                {/* Configuration Info (No Input) */}
                <div className="bg-slate-800 p-6 rounded-xl shadow-inner border border-slate-700">
                    <h2 className="text-2xl font-semibold text-indigo-400 mb-4 flex items-center gap-2">
                        <Terminal className="h-6 w-6" /> Configuration Status
                    </h2>
                    <p className="text-sm text-slate-400 mb-2">
                        <span className="font-semibold text-slate-300">Project ID:</span> {projectId === 'YOUR_GITLAB_PROJECT_ID' ? 'Placeholder (Update in code)' : projectId}
                    </p>
                    <p className="text-sm text-slate-400 mb-4">
                        <span className="font-semibold text-slate-300">Access Token:</span> {accessToken === 'YOUR_GITLAB_ACCESS_TOKEN' ? 'Placeholder (Update in code)' : '********'}
                    </p>
                    <p className="text-sm text-yellow-400 bg-yellow-900/20 border border-yellow-800 p-3 rounded-lg">
                        <span className="font-bold">Important:</span> For production, replace `YOUR_GITLAB_PROJECT_ID` and `YOUR_GITLAB_ACCESS_TOKEN` directly in the `App` component's code. In a real-world scenario, these would be loaded securely via environment variables or a backend service, *never* exposed in the UI or client-side source code.
                    </p>
                </div>

                {/* Controls Section */}
                <div className="bg-slate-800 p-6 rounded-xl shadow-inner border border-slate-700">
                    <h2 className="text-2xl font-semibold text-indigo-400 mb-4 flex items-center gap-2">
                        <Play className="h-6 w-6" /> Pipeline Controls
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Branch Selection */}
                        <div>
                            <label htmlFor="branchSelect" className="block text-slate-300 text-sm font-bold mb-2 flex items-center gap-2">
                                <GitBranch className="h-4 w-4" /> Select Branch:
                            </label>
                            <select
                                id="branchSelect"
                                className="shadow-sm border border-slate-600 rounded-lg w-full py-3 px-4 text-slate-100 leading-tight focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-slate-700 hover:bg-slate-600 transition duration-200"
                                value={selectedBranch}
                                onChange={(e) => setSelectedBranch(e.target.value)}
                                disabled={isLoading || branches.length === 0 || projectId === 'YOUR_GITLAB_PROJECT_ID'}
                            >
                                {branches.length === 0 ? (
                                    <option value="">Loading branches or none found...</option>
                                ) : (
                                    branches.map((branch) => (
                                        <option key={branch} value={branch}>
                                            {branch}
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>

                        {/* Maven Tags Input */}
                        <div>
                            <label htmlFor="mavenTags" className="block text-slate-300 text-sm font-bold mb-2 flex items-center gap-2">
                                <Tag className="h-4 w-4" /> Maven CLI Tags (Optional):
                            </label>
                            <input
                                type="text"
                                id="mavenTags"
                                className="shadow-sm appearance-none border border-slate-600 rounded-lg w-full py-3 px-4 text-slate-100 leading-tight focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-slate-700 hover:bg-slate-600 transition duration-200"
                                placeholder="-DskipTests -Dsome.property=value"
                                value={mavenTags}
                                onChange={(e) => setMavenTags(e.target.value)}
                                disabled={isLoading || projectId === 'YOUR_GITLAB_PROJECT_ID'}
                            />
                        </div>
                    </div>

                    {/* Trigger Button */}
                    <button
                        onClick={triggerPipeline}
                        disabled={isLoading || !selectedBranch || projectId === 'YOUR_GITLAB_PROJECT_ID'}
                        className={`mt-6 w-full py-3 px-6 rounded-lg text-lg font-bold transition duration-300 ease-in-out flex items-center justify-center gap-3
                            ${isLoading || !selectedBranch || projectId === 'YOUR_GITLAB_PROJECT_ID'
                                ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                                : 'bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-opacity-75 transform hover:scale-105'
                            }`}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="animate-spin h-5 w-5" /> Processing...
                            </>
                        ) : (
                            <>
                                <Play className="h-5 w-5" /> Trigger Pipeline
                            </>
                        )}
                    </button>
                </div>

                {/* Pipeline Status Section */}
                <div className="bg-slate-800 p-6 rounded-xl shadow-inner border border-slate-700">
                    <h2 className="text-2xl font-semibold text-indigo-400 mb-4 flex items-center gap-2">
                        <RefreshCw className="h-6 w-6" /> Pipeline Status
                    </h2>
                    <p className="text-lg text-slate-200 flex items-center gap-2">
                        <span className="font-bold">Status:</span>
                        {pipelineStatus.includes('success') && <CheckCircle className="text-green-400 h-5 w-5" />}
                        {(pipelineStatus.includes('failed') || pipelineStatus.includes('canceled') || pipelineStatus.includes('skipped')) && <XCircle className="text-red-400 h-5 w-5" />}
                        {!(pipelineStatus.includes('success') || pipelineStatus.includes('failed') || pipelineStatus.includes('canceled') || pipelineStatus.includes('skipped')) && <Loader2 className="animate-spin text-cyan-400 h-5 w-5" />}
                        {pipelineStatus}
                    </p>
                    {pipelineId && (
                        <p className="text-sm text-slate-400 mt-2">
                            Pipeline ID: {pipelineId} (Polling every 5 seconds)
                        </p>
                    )}
                    {error && (
                        <p className="text-red-400 text-sm italic mt-4">{error}</p>
                    )}
                </div>

                {/* Job Execution Logs Section */}
                <div className="bg-slate-800 p-6 rounded-xl shadow-inner border border-slate-700">
                    <h2 className="text-2xl font-semibold text-indigo-400 mb-4 flex items-center gap-2">
                        <FileText className="h-6 w-6" /> Job Execution Logs
                    </h2>
                    {jobLogs.length > 0 ? (
                        <div className="space-y-4">
                            {jobLogs.map((job) => (
                                <details key={job.id} className="group bg-slate-700 rounded-lg shadow-md overflow-hidden">
                                    <summary className="flex justify-between items-center p-4 cursor-pointer text-slate-200 font-semibold hover:bg-slate-600 transition duration-200">
                                        <span className="flex items-center gap-2">
                                            Job: {job.name} (Status: {job.status})
                                            {job.status === 'success' && <CheckCircle className="text-green-400 h-4 w-4" />}
                                            {(job.status === 'failed' || job.status === 'canceled' || job.status === 'skipped') && <XCircle className="text-red-400 h-4 w-4" />}
                                        </span>
                                        <span className="text-slate-400 group-open:hidden"><ChevronDown className="h-5 w-5" /></span>
                                        <span className="text-slate-400 group-close:hidden"><ChevronUp className="h-5 w-5" /></span>
                                    </summary>
                                    <div className="p-4 bg-slate-900 border-t border-slate-700">
                                        <pre className="text-xs text-slate-300 whitespace-pre-wrap break-all overflow-auto max-h-80 rounded-md p-3 bg-slate-950 border border-slate-800">
                                            {job.log || 'No log content available.'}
                                        </pre>
                                    </div>
                                </details>
                            ))}
                        </div>
                    ) : (
                        <p className="text-slate-400">
                            Job execution logs will appear here after a pipeline completes.
                        </p>
                    )}
                </div>

                {/* Artifacts Display Section */}
                <div className="bg-slate-800 p-6 rounded-xl shadow-inner border border-slate-700">
                    <h2 className="text-2xl font-semibold text-indigo-400 mb-4 flex items-center gap-2">
                        <GitBranch className="h-6 w-6" /> Generated Artifacts
                    </h2>
                    {artifactsUrl ? (
                        <>
                            <p className="text-slate-200 mb-4">
                                Displaying content from: <a href={artifactsUrl} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:underline break-all">{artifactsUrl}</a>
                            </p>
                            <div className="w-full h-96 bg-slate-900 rounded-lg overflow-hidden border border-slate-700">
                                <iframe
                                    src={artifactsUrl}
                                    title="Pipeline Artifacts"
                                    className="w-full h-full border-none"
                                    sandbox="allow-scripts allow-same-origin allow-popups allow-forms" // Essential for security
                                >
                                    Your browser does not support iframes.
                                </iframe>
                            </div>
                            <p className="text-sm text-slate-400 mt-4 bg-slate-900/20 border border-slate-700 p-3 rounded-lg">
                                <span className="font-semibold text-slate-300">Note:</span> For this iframe to display actual content, your GitLab CI/CD pipeline must publish the generated HTML, CSS, and JS files to a publicly accessible web server (e.g., GitLab Pages, S3, Netlify). The `artifactsUrl` state variable would then be updated with that public URL. The current URL is a placeholder.
                            </p>
                        </>
                    ) : (
                        <p className="text-slate-400">
                            Pipeline artifacts will appear here after a successful build.
                        </p>
                    )}
                </div>
            </div>

            {/* Tailwind CSS CDN and Font */}
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet" />
            <style>
                {`
                body {
                    font-family: 'Inter', sans-serif;
                }
                `}
            </style>
        </div>
    );
};

export default App;
