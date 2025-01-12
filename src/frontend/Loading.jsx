function Loading ({isLoading}) {
    return <div className="loader-wrapper">
      <div className="d-flex justify-content-center align-items-center position-absolute top-50 start-50 translate-middle">
        <div className="spinner-border text-white" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    </div>
}
export default Loading