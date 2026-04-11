import React, { useState, useEffect } from "react";
import UserPermissionManager from "./UserPermissionManager";

const getUserId = (u) => `${u?.id || u?._id || ""}`;

export default function ShareModal({
    fileData,
    setShowShareModal,
    shareLoading,
    setShareLoading,
    shareError,
    setShareError,
    shareSuccess,
    setShareSuccess,
    user,
    userSearch,
    setUserSearch,
    isUserLoading,
    allUsers,
    existingCollaborators,
    permissions,
    handleChangePermission,
}) {
    const [isPublic, setIsPublic] = useState(fileData.isPublic);
    const [isCopied, setIsCopied] = useState(false);
    const [isEmbedCopied, setIsEmbedCopied] = useState(false);
    const [embedWidth, setEmbedWidth] = useState("100%");
    const [embedHeight, setEmbedHeight] = useState("600px");

    useEffect(() => {
        setIsPublic(fileData.isPublic);
    }, [fileData.isPublic]);

    useEffect(() => {
        if (!isPublic) {
            setIsCopied(false);
        }
    }, [isPublic]);

    const handleTogglePublic = async (e) => {
        const nextPublic = e.target.checked;
        const previous = isPublic;
        setIsPublic(nextPublic);
        setShareLoading(true);
        setShareError("");
        setShareSuccess("");
        try {
            const apiService = (await import("../services/apiService")).default;
            const updated = await apiService.shareYamlFile(fileData._id, nextPublic);
            const confirmed = updated?.yamlFile?.isPublic ?? nextPublic;
            setIsPublic(confirmed);
            setShareSuccess(updated.message || "Sharing updated!");
        } catch (err) {
            setShareError(err.message || "Failed to update sharing");
            setIsPublic(previous);
        } finally {
            setShareLoading(false);
        }
    };

    return (
        <div className="share-modal-overlay" onClick={() => setShowShareModal(false)}>
            <div className="share-modal" onClick={(e) => e.stopPropagation()}>
                <button className="share-modal-close" onClick={() => setShowShareModal(false)} aria-label="Close share modal">✕</button>
                <h2 className="share-modal-title">Share this file</h2>
                <p className="share-modal-subtitle">Control public access and user-level permissions from one place.</p>

                <div className="share-toggle-card">
                    <label className="share-toggle-label">
                        <input
                            type="checkbox"
                            checked={isPublic}
                            disabled={shareLoading}
                            onChange={handleTogglePublic}
                        />
                        <span>
                            Make this file public
                            <small>Anyone with the link can view this file.</small>
                        </span>
                    </label>
                </div>

                {isPublic && fileData?.shareId && (
                    <>
                        <div className="share-link-card">
                            <span className="share-link-label">Share Link</span>
                            <div className="share-link-row">
                                <input
                                    type="text"
                                    value={`${window.location.origin}/shared/${fileData.shareId}`}
                                    readOnly
                                    className="share-link-input"
                                    onFocus={(e) => e.target.select()}
                                />
                                <button
                                    type="button"
                                    className="share-copy-btn"
                                    onClick={() => {
                                        navigator.clipboard.writeText(`${window.location.origin}/shared/${fileData.shareId}`);
                                        setIsCopied(true);
                                        setTimeout(() => setIsCopied(false), 1200);
                                    }}
                                >
                                    {isCopied ? "Copied" : "Copy"}
                                </button>
                            </div>
                        </div>

                        <div className="share-embed-card">
                            <span className="share-link-label">📊 Embed Code</span>
                            <p className="share-embed-description">
                                Embed this interactive diagram into your website, blog, or documentation.
                            </p>

                            <div className="share-embed-options">
                                <div className="share-embed-option">
                                    <label htmlFor="embed-width">Width:</label>
                                    <input
                                        id="embed-width"
                                        type="text"
                                        value={embedWidth}
                                        onChange={(e) => setEmbedWidth(e.target.value)}
                                        placeholder="e.g., 100%, 800px"
                                        className="share-embed-size-input"
                                    />
                                </div>
                                <div className="share-embed-option">
                                    <label htmlFor="embed-height">Height:</label>
                                    <input
                                        id="embed-height"
                                        type="text"
                                        value={embedHeight}
                                        onChange={(e) => setEmbedHeight(e.target.value)}
                                        placeholder="e.g., 600px, 80vh"
                                        className="share-embed-size-input"
                                    />
                                </div>
                            </div>

                            <div className="share-embed-code-container">
                                <textarea
                                    value={`<iframe src="${window.location.origin}/embed/${fileData.shareId}" width="${embedWidth}" height="${embedHeight}" frameborder="0" style="border: 1px solid #ddd; border-radius: 4px;" allowfullscreen></iframe>`}
                                    readOnly
                                    className="share-embed-code"
                                    rows="4"
                                    onFocus={(e) => e.target.select()}
                                />
                                <button
                                    type="button"
                                    className="share-copy-btn share-embed-copy-btn"
                                    onClick={() => {
                                        const embedCode = `<iframe src="${window.location.origin}/embed/${fileData.shareId}" width="${embedWidth}" height="${embedHeight}" frameborder="0" style="border: 1px solid #ddd; border-radius: 4px;" allowfullscreen></iframe>`;
                                        navigator.clipboard.writeText(embedCode);
                                        setIsEmbedCopied(true);
                                        setTimeout(() => setIsEmbedCopied(false), 1200);
                                    }}
                                >
                                    {isEmbedCopied ? "✓ Copied!" : "📋 Copy Embed Code"}
                                </button>
                            </div>

                            <div className="share-embed-preview-link">
                                <a
                                    href={`${window.location.origin}/embed/${fileData.shareId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="share-embed-preview-btn"
                                >
                                    👁️ Preview Embedded View
                                </a>
                            </div>
                        </div>
                    </>
                )}

                {getUserId(user) === `${fileData.owner}` && (
                    <div className="share-permissions-section">
                        <div className="share-user-search-wrap">
                            <input
                                type="text"
                                placeholder="Search users by name or email..."
                                value={userSearch}
                                onChange={(e) => setUserSearch(e.target.value)}
                                className="share-user-search"
                            />
                            {isUserLoading && <div className="share-user-loading">Searching users...</div>}
                        </div>
                        {(() => {
                            const existingIds = new Set(existingCollaborators.map((c) => `${c._id || c.id}`));
                            const searchUsers = allUsers.filter((u) => {
                                const uid = `${u.id || u._id}`;
                                return uid !== fileData.owner && !existingIds.has(uid);
                            });
                            const combinedUsers = [
                                ...existingCollaborators.filter((c) => `${c._id || c.id}` !== fileData.owner),
                                ...searchUsers,
                            ];
                            return (
                                <UserPermissionManager
                                    users={combinedUsers}
                                    permissions={permissions}
                                    onChangePermission={handleChangePermission}
                                    currentUserId={getUserId(user)}
                                    ownerId={fileData.owner}
                                />
                            );
                        })()}
                    </div>
                )}
                {shareError && <div className="share-status share-status-error">{shareError}</div>}
                {shareSuccess && <div className="share-status share-status-success">{shareSuccess}</div>}
            </div>
        </div>
    );
}
